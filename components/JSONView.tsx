import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface JSONViewProps {
  data: any;
}

interface Token {
  type: 'key' | 'string' | 'number' | 'boolean' | 'null' | 'bracket' | 'comma' | 'colon' | 'whitespace';
  content: string;
  line?: number;
}

export default function JSONView({ data }: JSONViewProps) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  const toggleCollapse = (line: number) => {
    setCollapsed(prev => {
      const newSet = new Set(prev);
      if (newSet.has(line)) {
        newSet.delete(line);
      } else {
        newSet.add(line);
      }
      return newSet;
    });
  };

  const handleCopy = () => {
    const jsonString = JSON.stringify(data, null, 2);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(jsonString);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const handleExpandAll = () => {
    setCollapsed(new Set());
  };

  const handleCollapseAll = () => {
    const lines = JSON.stringify(data, null, 2).split('\n');
    const collapsibleLines = new Set<number>();
    lines.forEach((line, index) => {
      if (line.trim().match(/^[\{\[]/)) {
        collapsibleLines.add(index);
      }
    });
    setCollapsed(collapsibleLines);
  };

  const tokenizeJSON = (json: string): Token[] => {
    const tokens: Token[] = [];
    let lineNumber = 0;

    const regex = /"([^"\\]*(\\.[^"\\]*)*)"\s*:|"([^"\\]*(\\.[^"\\]*)*)"|(-?\d+\.?\d*([eE][+-]?\d+)?)|true|false|null|([\{\}\[\]])|,|:|\s+/g;
    let match;
    let currentLine = 0;

    const lines = json.split('\n');

    lines.forEach((line, lineIdx) => {
      const lineMatch = /^(\s*)(.*)$/.exec(line);
      if (lineMatch) {
        const indent = lineMatch[1];
        const content = lineMatch[2];

        if (indent) {
          tokens.push({ type: 'whitespace', content: indent, line: lineIdx });
        }

        // Check for collapsible structure
        const isCollapsible = /^[\{\[]/.test(content.trim());

        let offset = 0;
        const contentRegex = /"([^"\\]*(\\.[^"\\]*)*)"\s*:|"([^"\\]*(\\.[^"\\]*)*)"|(-?\d+\.?\d*([eE][+-]?\d+)?)|true|false|null|([\{\}\[\]])|,|:/g;
        let contentMatch;

        while ((contentMatch = contentRegex.exec(content)) !== null) {
          if (contentMatch[0].includes(':') && contentMatch[0].startsWith('"')) {
            // Key
            const key = contentMatch[1];
            tokens.push({ type: 'key', content: `"${key}"`, line: lineIdx });
            tokens.push({ type: 'colon', content: ':', line: lineIdx });
          } else if (contentMatch[0].startsWith('"')) {
            // String value
            tokens.push({ type: 'string', content: contentMatch[0], line: lineIdx });
          } else if (contentMatch[5] !== undefined) {
            // Number
            tokens.push({ type: 'number', content: contentMatch[5], line: lineIdx });
          } else if (contentMatch[0] === 'true' || contentMatch[0] === 'false') {
            // Boolean
            tokens.push({ type: 'boolean', content: contentMatch[0], line: lineIdx });
          } else if (contentMatch[0] === 'null') {
            // Null
            tokens.push({ type: 'null', content: 'null', line: lineIdx });
          } else if (contentMatch[7]) {
            // Brackets
            tokens.push({ type: 'bracket', content: contentMatch[7], line: lineIdx });
          } else if (contentMatch[0] === ',') {
            // Comma
            tokens.push({ type: 'comma', content: ',', line: lineIdx });
          } else if (contentMatch[0] === ':' && !tokens[tokens.length - 1]?.content.includes(':')) {
            // Standalone colon
            tokens.push({ type: 'colon', content: ':', line: lineIdx });
          }

          if (contentMatch[0] === ' ') {
            tokens.push({ type: 'whitespace', content: ' ', line: lineIdx });
          }
        }

        tokens.push({ type: 'whitespace', content: '\n', line: lineIdx });
      }
    });

    return tokens;
  };

  const getColorForTokenType = (type: string): string => {
    switch (type) {
      case 'key':
        return '#9cdcfe'; // Light blue for keys
      case 'string':
        return '#ce9178'; // Orange for strings
      case 'number':
        return '#b5cea8'; // Light green for numbers
      case 'boolean':
        return '#569cd6'; // Blue for booleans
      case 'null':
        return '#569cd6'; // Blue for null
      case 'bracket':
        return '#ffd700'; // Gold for brackets
      case 'comma':
      case 'colon':
        return '#d4d4d4'; // Default for punctuation
      case 'whitespace':
      default:
        return '#d4d4d4';
    }
  };

  const jsonString = JSON.stringify(data, null, 2);
  const tokens = tokenizeJSON(jsonString);

  // Highlight search term
  const highlightedTokens = searchTerm ? tokens.map(token => {
    if ((token.type === 'key' || token.type === 'string') &&
        token.content.toLowerCase().includes(searchTerm.toLowerCase())) {
      return { ...token, highlighted: true };
    }
    return token;
  }) : tokens;

  const lines = jsonString.split('\n');
  const lineCount = lines.length;

  return (
    <View style={styles.container}>
      {/* Toolbar */}
      <View style={styles.toolbar}>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search in JSON..."
            placeholderTextColor="#858585"
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
          <Ionicons name="search" size={16} color="#cccccc" style={styles.searchIcon} />
        </View>

        <View style={styles.buttonGroup}>
          <TouchableOpacity onPress={handleExpandAll} style={styles.toolButton}>
            <Ionicons name="chevron-down-outline" size={16} color="#cccccc" />
            <Text style={styles.toolButtonText}>Expand All</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleCollapseAll} style={styles.toolButton}>
            <Ionicons name="chevron-forward-outline" size={16} color="#cccccc" />
            <Text style={styles.toolButtonText}>Collapse All</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleCopy} style={styles.toolButton}>
            <Ionicons
              name={copySuccess ? "checkmark" : "copy-outline"}
              size={16}
              color={copySuccess ? "#4ec9b0" : "#cccccc"}
            />
            <Text style={[styles.toolButtonText, copySuccess && styles.successText]}>
              {copySuccess ? 'Copied!' : 'Copy'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>
            {lineCount} lines | {JSON.stringify(data).length} characters
          </Text>
        </View>
      </View>

      {/* JSON Content */}
      <ScrollView style={styles.scrollView} horizontal>
        <ScrollView style={styles.content}>
          <View style={styles.codeContainer}>
            <View style={styles.lineNumbers}>
              {lines.map((_, index) => (
                <Text key={index} style={styles.lineNumber}>
                  {index + 1}
                </Text>
              ))}
            </View>
            <View style={styles.codeContent}>
              <Text style={styles.codeText}>
                {highlightedTokens.map((token, index) => (
                  <Text
                    key={index}
                    style={[
                      { color: getColorForTokenType(token.type) },
                      (token as any).highlighted && styles.highlighted
                    ]}
                  >
                    {token.content}
                  </Text>
                ))}
              </Text>
            </View>
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
  toolbar: {
    backgroundColor: '#2d2d30',
    borderBottomWidth: 1,
    borderBottomColor: '#3e3e42',
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3e3e42',
    borderRadius: 4,
    paddingHorizontal: 8,
    flex: 1,
    minWidth: 200,
  },
  searchInput: {
    flex: 1,
    color: '#cccccc',
    fontSize: 13,
    paddingVertical: 6,
    fontFamily: 'monospace',
  },
  searchIcon: {
    marginLeft: 4,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  toolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#3e3e42',
    borderRadius: 4,
  },
  toolButtonText: {
    color: '#cccccc',
    fontSize: 11,
  },
  successText: {
    color: '#4ec9b0',
  },
  statsContainer: {
    marginLeft: 'auto',
  },
  statsText: {
    color: '#858585',
    fontSize: 11,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  codeContainer: {
    flexDirection: 'row',
    padding: 12,
  },
  lineNumbers: {
    paddingRight: 16,
    borderRightWidth: 1,
    borderRightColor: '#3e3e42',
    marginRight: 12,
  },
  lineNumber: {
    color: '#858585',
    fontSize: 13,
    fontFamily: 'monospace',
    textAlign: 'right',
    lineHeight: 20,
    minWidth: 30,
  },
  codeContent: {
    flex: 1,
  },
  codeText: {
    fontSize: 13,
    fontFamily: 'monospace',
    lineHeight: 20,
  },
  highlighted: {
    backgroundColor: '#264f78',
    borderRadius: 2,
  },
});
