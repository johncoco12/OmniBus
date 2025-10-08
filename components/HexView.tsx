import React, { useState, useMemo, useCallback, memo, useRef } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface HexViewProps {
  data: string;
}

interface ByteData {
  offset: number;
  value: number;
  hex: string;
  ascii: string;
}

// Memoized byte component to prevent unnecessary re-renders
const HexByte = memo(({
  byteValue,
  byteIndex,
  isSelected,
  onMouseDown,
  onMouseEnter
}: {
  byteValue: number;
  byteIndex: number;
  isSelected: boolean;
  onMouseDown: (idx: number) => void;
  onMouseEnter: (idx: number) => void;
}) => {
  const InteractiveView: any = View;
  const hex = byteValue.toString(16).padStart(2, '0').toUpperCase();

  return (
    <InteractiveView
      onMouseDown={() => onMouseDown(byteIndex)}
      onMouseEnter={() => onMouseEnter(byteIndex)}
      style={[styles.byteBox, isSelected && styles.selectedByte]}
    >
      <Text style={[styles.hexByteText, isSelected && styles.selectedText]}>
        {hex}
      </Text>
    </InteractiveView>
  );
});

const AsciiByte = memo(({
  byteValue,
  byteIndex,
  isSelected,
  onMouseDown,
  onMouseEnter
}: {
  byteValue: number;
  byteIndex: number;
  isSelected: boolean;
  onMouseDown: (idx: number) => void;
  onMouseEnter: (idx: number) => void;
}) => {
  const InteractiveView: any = View;
  const ascii = (byteValue >= 32 && byteValue <= 126) ? String.fromCharCode(byteValue) : '.';

  return (
    <InteractiveView
      onMouseDown={() => onMouseDown(byteIndex)}
      onMouseEnter={() => onMouseEnter(byteIndex)}
      style={[styles.asciiByteBox, isSelected && styles.selectedByte]}
    >
      <Text style={[styles.asciiByteText, isSelected && styles.selectedText]}>
        {ascii}
      </Text>
    </InteractiveView>
  );
});

export default function HexView({ data }: HexViewProps) {
  const InteractiveView: any = View;
  const [selectedBytes, setSelectedBytes] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [gotoOffset, setGotoOffset] = useState('');
  const [encoding, setEncoding] = useState<'UTF-8' | 'ASCII' | 'UTF-16'>('UTF-8');
  const [bytesPerLine] = useState(16);
  const selectionStartRef = useRef<number | null>(null);
  const isSelectingRef = useRef(false);

  const encodeData = useCallback((str: string, enc: string): Uint8Array => {
    switch (enc) {
      case 'UTF-8':
        return new TextEncoder().encode(str);
      case 'ASCII':
        return Uint8Array.from(str.split('').map(c => c.charCodeAt(0) & 0x7F));
      case 'UTF-16':
        const arr = new Uint16Array(str.length);
        for (let i = 0; i < str.length; i++) {
          arr[i] = str.charCodeAt(i);
        }
        return new Uint8Array(arr.buffer);
      default:
        return new TextEncoder().encode(str);
    }
  }, []);

  // Memoize byte array computation
  const bytes = useMemo(() => encodeData(data, encoding), [data, encoding, encodeData]);

  // Limit data size for performance - show warning for very large files
  const MAX_DISPLAY_BYTES = 1000000; // 1MB
  const isLargeFile = bytes.length > MAX_DISPLAY_BYTES;
  const displayBytes = isLargeFile ? bytes.slice(0, MAX_DISPLAY_BYTES) : bytes;

  const handleByteMouseDown = useCallback((byteIndex: number) => {
    selectionStartRef.current = byteIndex;
    isSelectingRef.current = true;
    setSelectedBytes(new Set([byteIndex]));
  }, []);

  const handleByteMouseEnter = useCallback((byteIndex: number) => {
    if (!isSelectingRef.current || selectionStartRef.current === null) return;

    const start = Math.min(selectionStartRef.current, byteIndex);
    const end = Math.max(selectionStartRef.current, byteIndex);

    // Only update if selection actually changed
    setSelectedBytes(prev => {
      // Quick check if selection is the same
      if (prev.size === (end - start + 1) && prev.has(start) && prev.has(end)) {
        return prev;
      }

      const newSelection = new Set<number>();
      for (let i = start; i <= end; i++) {
        newSelection.add(i);
      }
      return newSelection;
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    isSelectingRef.current = false;
  }, []);

  const handleGoto = useCallback(() => {
    const offset = parseInt(gotoOffset, 16);
    if (!isNaN(offset) && offset >= 0 && offset < displayBytes.length) {
      setSelectedBytes(new Set([offset]));
      // Scroll to offset would require ref implementation
    }
  }, [gotoOffset, displayBytes.length]);

  const handleSearch = useCallback(() => {
    if (!searchTerm) return;
    const searchBytes = new TextEncoder().encode(searchTerm);

    // Simple search - find first occurrence
    for (let i = 0; i <= displayBytes.length - searchBytes.length; i++) {
      let match = true;
      for (let j = 0; j < searchBytes.length; j++) {
        if (displayBytes[i + j] !== searchBytes[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        const newSelection = new Set<number>();
        for (let j = 0; j < searchBytes.length; j++) {
          newSelection.add(i + j);
        }
        setSelectedBytes(newSelection);
        return;
      }
    }
  }, [searchTerm, displayBytes]);

  // Memoize line rendering
  const renderLine = useCallback((lineIndex: number) => {
    const offset = lineIndex * bytesPerLine;
    const lineBytes = displayBytes.slice(offset, offset + bytesPerLine);

    return (
      <View key={lineIndex} style={styles.hexRow}>
        <Text style={styles.offsetText}>
          {offset.toString(16).padStart(8, '0').toUpperCase()}
        </Text>
        <Text style={styles.spacer}>  </Text>

        <View style={styles.hexBytesContainer}>
          {Array.from(lineBytes).map((byte, idx) => (
            <HexByte
              key={offset + idx}
              byteValue={byte}
              byteIndex={offset + idx}
              isSelected={selectedBytes.has(offset + idx)}
              onMouseDown={handleByteMouseDown}
              onMouseEnter={handleByteMouseEnter}
            />
          ))}
          {/* Padding for incomplete lines */}
          {Array.from({ length: bytesPerLine - lineBytes.length }).map((_, idx) => (
            <View key={`pad-${idx}`} style={styles.byteBox}>
              <Text style={styles.hexByteText}>  </Text>
            </View>
          ))}
        </View>

        <Text style={styles.spacer}>  </Text>

        <View style={styles.asciiBytesContainer}>
          {Array.from(lineBytes).map((byte, idx) => (
            <AsciiByte
              key={offset + idx}
              byteValue={byte}
              byteIndex={offset + idx}
              isSelected={selectedBytes.has(offset + idx)}
              onMouseDown={handleByteMouseDown}
              onMouseEnter={handleByteMouseEnter}
            />
          ))}
        </View>
      </View>
    );
  }, [displayBytes, bytesPerLine, selectedBytes, handleByteMouseDown, handleByteMouseEnter]);

  const totalLines = Math.ceil(displayBytes.length / bytesPerLine);

  // Memoize all lines
  const allLines = useMemo(() => {
    return Array.from({ length: totalLines }).map((_, idx) => renderLine(idx));
  }, [totalLines, renderLine]);

  return (
    <InteractiveView style={styles.container} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      {/* Controls */}
      <View style={styles.controls}>
        {isLargeFile && (
          <View style={styles.warningBanner}>
            <Ionicons name="warning" size={16} color="#f48771" />
            <Text style={styles.warningText}>
              Large file detected ({bytes.length.toLocaleString()} bytes). Displaying first {MAX_DISPLAY_BYTES.toLocaleString()} bytes for performance.
            </Text>
          </View>
        )}

        <View style={styles.controlRow}>
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search..."
              placeholderTextColor="#858585"
              value={searchTerm}
              onChangeText={setSearchTerm}
              onSubmitEditing={handleSearch}
            />
            <TouchableOpacity onPress={handleSearch} style={styles.iconButton}>
              <Ionicons name="search" size={16} color="#cccccc" />
            </TouchableOpacity>
          </View>

          <View style={styles.gotoContainer}>
            <TextInput
              style={styles.gotoInput}
              placeholder="Goto (hex)..."
              placeholderTextColor="#858585"
              value={gotoOffset}
              onChangeText={setGotoOffset}
              onSubmitEditing={handleGoto}
            />
            <TouchableOpacity onPress={handleGoto} style={styles.iconButton}>
              <Ionicons name="arrow-forward" size={16} color="#cccccc" />
            </TouchableOpacity>
          </View>

          <View style={styles.encodingContainer}>
            <Text style={styles.encodingLabel}>Encoding:</Text>
            {(['UTF-8', 'ASCII', 'UTF-16'] as const).map((enc) => (
              <TouchableOpacity
                key={enc}
                onPress={() => setEncoding(enc)}
                style={[styles.encodingButton, encoding === enc && styles.activeEncodingButton]}
              >
                <Text style={[styles.encodingText, encoding === enc && styles.activeEncodingText]}>
                  {enc}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoText}>
            Size: {displayBytes.length.toLocaleString()} bytes | Selected: {selectedBytes.size} byte{selectedBytes.size !== 1 ? 's' : ''}
          </Text>
          {selectedBytes.size > 0 && (
            <TouchableOpacity onPress={() => setSelectedBytes(new Set())} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>Clear Selection</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Hex View */}
      <ScrollView style={styles.scrollView}>
        <View style={styles.hexContainer}>
          {allLines}
        </View>
      </ScrollView>
    </InteractiveView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
  controls: {
    backgroundColor: '#2d2d30',
    borderBottomWidth: 1,
    borderBottomColor: '#3e3e42',
    padding: 8,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#3e2e1f',
    padding: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  warningText: {
    color: '#f48771',
    fontSize: 12,
    flex: 1,
  },
  controlRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
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
  gotoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3e3e42',
    borderRadius: 4,
    paddingHorizontal: 8,
    flex: 1,
    minWidth: 150,
  },
  gotoInput: {
    flex: 1,
    color: '#cccccc',
    fontSize: 13,
    paddingVertical: 6,
    fontFamily: 'monospace',
  },
  iconButton: {
    padding: 4,
  },
  encodingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  encodingLabel: {
    color: '#cccccc',
    fontSize: 12,
    marginRight: 4,
  },
  encodingButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#3e3e42',
  },
  activeEncodingButton: {
    backgroundColor: '#007acc',
  },
  encodingText: {
    color: '#858585',
    fontSize: 11,
  },
  activeEncodingText: {
    color: '#ffffff',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoText: {
    color: '#858585',
    fontSize: 11,
  },
  clearButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#3e3e42',
    borderRadius: 4,
  },
  clearButtonText: {
    color: '#cccccc',
    fontSize: 11,
  },
  scrollView: {
    flex: 1,
  },
  hexContainer: {
    padding: 12,
  },
  hexRow: {
    flexDirection: 'row',
    marginBottom: 2,
    alignItems: 'center',
  },
  offsetText: {
    color: '#858585',
    fontSize: 13,
    fontFamily: 'monospace',
    width: 80,
  },
  spacer: {
    color: '#858585',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  hexBytesContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  asciiBytesContainer: {
    flexDirection: 'row',
  },
  byteBox: {
    paddingHorizontal: 2,
    paddingVertical: 1,
    borderRadius: 2,
    // Cast web-only style props
    ...( { cursor: 'text', userSelect: 'none' } as any ),
  },
  asciiByteBox: {
    paddingHorizontal: 1,
    paddingVertical: 1,
    borderRadius: 2,
    ...( { cursor: 'text', userSelect: 'none' } as any ),
  },
  selectedByte: {
    backgroundColor: '#264f78',
  },
  hexByteText: {
    color: '#4ec9b0',
    fontSize: 13,
    fontFamily: 'monospace',
    minWidth: 20,
    textAlign: 'center',
  },
  asciiByteText: {
    color: '#d4d4d4',
    fontSize: 13,
    fontFamily: 'monospace',
    width: 10,
    textAlign: 'center',
  },
  selectedText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
});
