import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, TextInput, Modal, ScrollView } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';

interface EditMessageModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (updatedBody: string) => void;
  message: any;
  queueName?: string;
}

export default function EditMessageModal({ visible, onClose, onSave, message, queueName }: EditMessageModalProps) {
  const [messageBody, setMessageBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(true);
  const [lineCount, setLineCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [indentSize, setIndentSize] = useState(2);
  const [searchText, setSearchText] = useState('');
  const [searchMatches, setSearchMatches] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const textInputRef = useRef<any>(null);
  const textChangeTimeoutRef = useRef<any>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });

  useEffect(() => {
    if (message && visible) {
      const formatted = JSON.stringify(message.body, null, indentSize);
      setMessageBody(formatted);
      setHistory([formatted]);
      setHistoryIndex(0);
      setError(null);
      setIsValid(true);
      updateStats(formatted);
      
      if (textInputRef.current && textInputRef.current.focus) {
        // Ensure the text input gets focus when needed
        setTimeout(() => {
          textInputRef.current.focus();
        }, 0);
      }
    }
  }, [message, visible, indentSize]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Z for Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z for Redo
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
      // Ctrl/Cmd + F for Find
      else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
      }
      // Escape to close search
      else if (e.key === 'Escape' && showSearch) {
        e.preventDefault();
        setShowSearch(false);
      }
    };

    if (visible) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [visible, historyIndex, history, showSearch]);

  const updateStats = useCallback((text: string) => {
    // Calculate line count ensuring empty string results in 1 line
    const lines = text ? text.split('\n') : [''];
    setLineCount(lines.length);
    setCharCount(text.length);

    // Update search matches
    if (searchText) {
      const matches = text.toLowerCase().split(searchText.toLowerCase()).length - 1;
      setSearchMatches(matches);
      if (matches > 0 && currentMatch > matches) {
        setCurrentMatch(1);
      }
    }
  }, [searchText, currentMatch]);

  const handleTextChange = useCallback((text: string) => {
    setMessageBody(text);
    updateStats(text);

    // Add to history after a short delay (debounced)
    if (textChangeTimeoutRef.current) {
      clearTimeout(textChangeTimeoutRef.current);
    }
    textChangeTimeoutRef.current = setTimeout(() => {
      addToHistory(text);
    }, 500);

    // Validate JSON
    try {
      JSON.parse(text);
      setError(null);
      setIsValid(true);
    } catch (err: any) {
      setError(err.message);
      setIsValid(false);
    }
  }, []);

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(messageBody);
      const formatted = JSON.stringify(parsed, null, indentSize);
      setMessageBody(formatted);
      updateStats(formatted);
      addToHistory(formatted);
      setError(null);
      setIsValid(true);
    } catch (err: any) {
      setError('Cannot format: ' + err.message);
    }
  };

  const handleMinify = () => {
    try {
      const parsed = JSON.parse(messageBody);
      const minified = JSON.stringify(parsed);
      setMessageBody(minified);
      updateStats(minified);
      addToHistory(minified);
      setError(null);
      setIsValid(true);
    } catch (err: any) {
      setError('Cannot minify: ' + err.message);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(messageBody);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setMessageBody(text);
      updateStats(text);
      addToHistory(text);
    } catch (err) {
      console.error('Failed to paste:', err);
    }
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setMessageBody(history[newIndex]);
      updateStats(history[newIndex]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setMessageBody(history[newIndex]);
      updateStats(history[newIndex]);
    }
  };

  const addToHistory = (text: string) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(text);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleSave = () => {
    try {
      // Validate JSON
      JSON.parse(messageBody);
      onSave(messageBody);
    } catch (error: any) {
      setError('Cannot save: ' + error.message);
    }
  };

  const handleCancel = () => {
    onClose();
    // Reset to original
    if (message) {
      setMessageBody(JSON.stringify(message.body, null, indentSize));
    }
    setError(null);
    setShowSearch(false);
    setSearchText('');
  };

  const handleSearch = useCallback(() => {
    if (!searchText) return;

    const text = messageBody.toLowerCase();
    const search = searchText.toLowerCase();
    const matches = text.split(search).length - 1;
    setSearchMatches(matches);

    if (matches > 0) {
      setCurrentMatch(1);
      
      // Position to the first match
      if (textInputRef.current) {
        navigateToMatch(1);
      }
    }
  }, [searchText, messageBody]);

  const handleNextMatch = useCallback(() => {
    if (searchMatches > 0) {
      const nextMatch = currentMatch >= searchMatches ? 1 : currentMatch + 1;
      setCurrentMatch(nextMatch);
      navigateToMatch(nextMatch);
    }
  }, [searchMatches, currentMatch]);

  const handlePrevMatch = useCallback(() => {
    if (searchMatches > 0) {
      const prevMatch = currentMatch <= 1 ? searchMatches : currentMatch - 1;
      setCurrentMatch(prevMatch);
      navigateToMatch(prevMatch);
    }
  }, [searchMatches, currentMatch]);
  
  // Function to navigate to a specific match
  const navigateToMatch = useCallback((matchIndex: number) => {
    if (!textInputRef.current) return;
    
    // Find position of the match
    const text = messageBody.toLowerCase();
    const searchLower = searchText.toLowerCase();
    
    let position = -1;
    
    // Find the nth occurrence
    for (let i = 0; i < matchIndex; i++) {
      position = text.indexOf(searchLower, position + 1);
      if (position === -1) break;
    }
    
    if (position >= 0 && textInputRef.current && textInputRef.current.setSelection) {
      // Select the text in the editor
      textInputRef.current.setSelection(position, position + searchText.length);
    }
  }, [messageBody, searchText]);

  const handleEscape = (text: string) => {
    const escaped = JSON.stringify(text);
    setMessageBody(escaped);
    updateStats(escaped);
  };

  const handleSort = () => {
    try {
      const parsed = JSON.parse(messageBody);
      const sorted = sortObject(parsed);
      const formatted = JSON.stringify(sorted, null, indentSize);
      setMessageBody(formatted);
      updateStats(formatted);
      addToHistory(formatted);
      setError(null);
    } catch (err: any) {
      setError('Cannot sort: ' + err.message);
    }
  };

  const sortObject = (obj: any): any => {
    if (Array.isArray(obj)) {
      return obj.map(sortObject);
    } else if (obj !== null && typeof obj === 'object') {
      return Object.keys(obj)
        .sort()
        .reduce((result: any, key) => {
          result[key] = sortObject(obj[key]);
          return result;
        }, {});
    }
    return obj;
  };

  // Render the editor content
  const renderEditorContent = useCallback(() => {
    return (
      <TextInput
        ref={textInputRef}
        style={styles.plainEditor}
        value={messageBody}
        onChangeText={handleTextChange}
        onSelectionChange={(event) => {
          const { selection } = event.nativeEvent;
          const textBeforeCursor = messageBody.substring(0, selection.start);
          const lines = textBeforeCursor.split('\n');
          const line = lines.length;
          const column = lines[lines.length - 1].length + 1;
          setCursorPosition({ line, column });
        }}
        placeholder='{"key": "value"}'
        placeholderTextColor="#858585"
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
      />
    );
  }, [messageBody, handleTextChange]);
  
  // Display search match indicator
  const displaySearchIndicator = useCallback(() => {
    if (!showSearch || !searchText || searchMatches === 0) return null;
    
    // Simple indicator for search matches
    return (
      <View style={{
        position: 'absolute',
        bottom: 10, 
        right: 10,
        backgroundColor: 'rgba(14, 99, 156, 0.8)',
        padding: 6,
        borderRadius: 4,
        zIndex: 10,
      }}>
        <Text style={{
          color: '#ffffff',
          fontSize: 12,
        }}>
          {currentMatch} of {searchMatches} matches
        </Text>
      </View>
    );
  }, [showSearch, searchText, searchMatches, currentMatch]);

  if (!message) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <MaterialIcons name="edit" size={20} color="#cccccc" />
              <View>
                <Text style={styles.title}>Edit Message</Text>
                <Text style={styles.subtitle}>
                  Queue: {queueName} | ID: {message.label}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleCancel} style={styles.closeButton}>
              <MaterialIcons name="close" size={20} color="#cccccc" />
            </TouchableOpacity>
          </View>

          {/* Toolbar */}
          <View style={styles.toolbar}>
            <View style={styles.toolbarGroup}>
              <TouchableOpacity
                style={[styles.toolButton, historyIndex <= 0 && styles.toolButtonDisabled]}
                onPress={handleUndo}
                disabled={historyIndex <= 0}
              >
                <MaterialIcons name="undo" size={18} color={historyIndex <= 0 ? '#555' : '#cccccc'} />
                <Text style={[styles.toolButtonText, historyIndex <= 0 && styles.toolButtonTextDisabled]}>Undo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toolButton, historyIndex >= history.length - 1 && styles.toolButtonDisabled]}
                onPress={handleRedo}
                disabled={historyIndex >= history.length - 1}
              >
                <MaterialIcons name="redo" size={18} color={historyIndex >= history.length - 1 ? '#555' : '#cccccc'} />
                <Text style={[styles.toolButtonText, historyIndex >= history.length - 1 && styles.toolButtonTextDisabled]}>Redo</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.separator} />

            <View style={styles.toolbarGroup}>
              <TouchableOpacity style={styles.toolButton} onPress={handleFormat}>
                <MaterialCommunityIcons name="code-braces" size={18} color="#cccccc" />
                <Text style={styles.toolButtonText}>Format</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.toolButton} onPress={handleMinify}>
                <MaterialCommunityIcons name="arrow-collapse-horizontal" size={18} color="#cccccc" />
                <Text style={styles.toolButtonText}>Minify</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.toolButton} onPress={handleSort}>
                <MaterialIcons name="sort-by-alpha" size={18} color="#cccccc" />
                <Text style={styles.toolButtonText}>Sort</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.separator} />

            <View style={styles.toolbarGroup}>
              <TouchableOpacity style={styles.toolButton} onPress={handleCopy}>
                <MaterialIcons name="content-copy" size={18} color="#cccccc" />
                <Text style={styles.toolButtonText}>Copy</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.toolButton} onPress={handlePaste}>
                <MaterialIcons name="content-paste" size={18} color="#cccccc" />
                <Text style={styles.toolButtonText}>Paste</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.separator} />

            <View style={styles.toolbarGroup}>
              <TouchableOpacity
                style={[styles.toolButton, showSearch && styles.toolButtonActive]}
                onPress={() => setShowSearch(!showSearch)}
              >
                <MaterialIcons name="search" size={18} color="#cccccc" />
                <Text style={styles.toolButtonText}>Find</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.toolbarSpacer} />

            {/* Indent Size Selector */}
            <View style={styles.indentSelector}>
              <Text style={styles.indentLabel}>Indent:</Text>
              {[2, 4].map((size) => (
                <TouchableOpacity
                  key={size}
                  style={[styles.indentButton, indentSize === size && styles.indentButtonActive]}
                  onPress={() => setIndentSize(size)}
                >
                  <Text style={[styles.indentButtonText, indentSize === size && styles.indentButtonTextActive]}>
                    {size}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Search Bar */}
          {showSearch && (
            <View style={styles.searchBar}>
              <MaterialIcons name="search" size={16} color="#858585" />
              <TextInput
                style={styles.searchInput}
                value={searchText}
                onChangeText={(text) => {
                  setSearchText(text);
                  handleSearch();
                }}
                placeholder="Search..."
                placeholderTextColor="#858585"
              />
              {searchMatches > 0 && (
                <Text style={styles.searchCount}>
                  {currentMatch} / {searchMatches}
                </Text>
              )}
              <TouchableOpacity style={styles.searchNavButton} onPress={handlePrevMatch}>
                <MaterialIcons name="arrow-upward" size={16} color="#cccccc" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.searchNavButton} onPress={handleNextMatch}>
                <MaterialIcons name="arrow-downward" size={16} color="#cccccc" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowSearch(false)}>
                <MaterialIcons name="close" size={16} color="#858585" />
              </TouchableOpacity>
            </View>
          )}

          {/* Status Bar */}
          <View style={styles.statusBar}>
            <View style={styles.statusLeft}>
              <View style={[styles.statusIndicator, isValid ? styles.statusValid : styles.statusInvalid]}>
                <MaterialIcons
                  name={isValid ? 'check-circle' : 'error'}
                  size={14}
                  color={isValid ? '#4caf50' : '#f48771'}
                />
                <Text style={[styles.statusText, isValid ? styles.statusTextValid : styles.statusTextInvalid]}>
                  {isValid ? 'Valid JSON' : 'Invalid JSON'}
                </Text>
              </View>
            </View>
            <View style={styles.statusRight}>
              <Text style={styles.statusText}>Lines: {lineCount}</Text>
              <Text style={styles.statusText}>Characters: {charCount}</Text>
              <Text style={styles.statusText}>Size: {message.size} bytes</Text>
              <Text style={styles.statusText}>Ln {cursorPosition.line}, Col {cursorPosition.column}</Text>
            </View>
          </View>

          {/* Editor - Completely Refactored Approach */}
          <View style={styles.editorContainer}>
            <ScrollView 
              style={styles.editorScroll}
              contentContainerStyle={{flexGrow: 1}}
              showsVerticalScrollIndicator={true}
            >
              {renderEditorContent()}
              {displaySearchIndicator()}
            </ScrollView>
          </View>

          {/* Error Display */}
          {error && (
            <View style={styles.errorContainer}>
              <MaterialIcons name="error" size={16} color="#f48771" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Message Info */}
          <View style={styles.infoSection}>
            <Text style={styles.infoLabel}>Message Metadata</Text>
            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <Text style={styles.infoKey}>Enqueued:</Text>
                <Text style={styles.infoValue}>{message.enqueuedTime}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoKey}>Delivery Count:</Text>
                <Text style={styles.infoValue}>{message.deliveryCount}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoKey}>Sequence:</Text>
                <Text style={styles.infoValue}>{message.sequenceNumber}</Text>
              </View>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.footerLeft}>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleFormat}>
                <MaterialIcons name="auto-fix-high" size={16} color="#cccccc" />
                <Text style={styles.secondaryButtonText}>Auto-Format</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.footerRight}>
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, !isValid && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={!isValid}
              >
                <MaterialIcons name="save" size={16} color="#ffffff" />
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    width: '95%',
    maxWidth: 1000,
    maxHeight: '95%',
    backgroundColor: '#252526',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#454545',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  plainEditor: {
    flex: 1,
    color: '#cccccc',
    backgroundColor: '#1e1e1e',
    fontSize: 13,
    fontFamily: 'monospace',
    padding: 12,
    lineHeight: 20,
    minHeight: 400,
    textAlignVertical: 'top',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#3e3e42',
    backgroundColor: '#2d2d30',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    color: '#cccccc',
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    color: '#858585',
    fontSize: 11,
    marginTop: 2,
  },
  closeButton: {
    padding: 4,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#2d2d30',
    borderBottomWidth: 1,
    borderBottomColor: '#3e3e42',
    gap: 4,
  },
  toolbarGroup: {
    flexDirection: 'row',
    gap: 2,
  },
  separator: {
    width: 1,
    height: 24,
    backgroundColor: '#3e3e42',
    marginHorizontal: 4,
  },
  toolbarSpacer: {
    flex: 1,
  },
  toolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
  toolButtonActive: {
    backgroundColor: '#094771',
  },
  toolButtonDisabled: {
    opacity: 0.3,
  },
  toolButtonText: {
    color: '#cccccc',
    fontSize: 11,
  },
  toolButtonTextDisabled: {
    color: '#555',
  },
  indentSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  indentLabel: {
    color: '#858585',
    fontSize: 11,
  },
  indentButton: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 3,
    backgroundColor: '#3e3e42',
  },
  indentButtonActive: {
    backgroundColor: '#0e639c',
  },
  indentButtonText: {
    color: '#858585',
    fontSize: 11,
  },
  indentButtonTextActive: {
    color: '#ffffff',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    backgroundColor: '#2d2d30',
    borderBottomWidth: 1,
    borderBottomColor: '#3e3e42',
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#3e3e42',
    color: '#cccccc',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    fontSize: 12,
  },
  searchCount: {
    color: '#858585',
    fontSize: 11,
  },
  searchNavButton: {
    padding: 4,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#1e1e1e',
    borderBottomWidth: 1,
    borderBottomColor: '#3e3e42',
  },
  statusLeft: {
    flexDirection: 'row',
    gap: 12,
  },
  statusRight: {
    flexDirection: 'row',
    gap: 12,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusValid: {},
  statusInvalid: {},
  statusText: {
    color: '#858585',
    fontSize: 11,
  },
  statusTextValid: {
    color: '#4caf50',
  },
  statusTextInvalid: {
    color: '#f48771',
  },
  editorContainer: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    minHeight: 400,
    borderWidth: 1,
    borderColor: '#3e3e42',
  },
  editorScrollContainer: {
    flex: 1,
    position: 'relative',
  },
  editorScroll: {
    flex: 1,
  },
  lineNumbers: {
    backgroundColor: '#2d2d30',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: '#3e3e42',
    minWidth: 50,
    display: 'none', // Hide line numbers in unified approach
  },
  lineNumber: {
    color: '#858585',
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'right',
    lineHeight: 20,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#3e2626',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#5e3636',
  },
  errorText: {
    color: '#f48771',
    fontSize: 12,
    flex: 1,
  },
  infoSection: {
    padding: 12,
    backgroundColor: '#2d2d30',
    borderTopWidth: 1,
    borderTopColor: '#3e3e42',
  },
  infoLabel: {
    color: '#cccccc',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  infoItem: {
    flexDirection: 'row',
    gap: 6,
  },
  infoKey: {
    color: '#858585',
    fontSize: 11,
  },
  infoValue: {
    color: '#cccccc',
    fontSize: 11,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#3e3e42',
    backgroundColor: '#2d2d30',
  },
  footerLeft: {
    flexDirection: 'row',
    gap: 8,
  },
  footerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    backgroundColor: '#3e3e42',
  },
  secondaryButtonText: {
    color: '#cccccc',
    fontSize: 13,
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    backgroundColor: '#3e3e42',
  },
  cancelButtonText: {
    color: '#cccccc',
    fontSize: 13,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    backgroundColor: '#0e639c',
  },
  saveButtonDisabled: {
    backgroundColor: '#3e3e42',
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
  },
});
