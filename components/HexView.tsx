import React, { useState } from 'react';
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

export default function HexView({ data }: HexViewProps) {
  const InteractiveView: any = View;
  const [selectedBytes, setSelectedBytes] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [gotoOffset, setGotoOffset] = useState('');
  const [encoding, setEncoding] = useState<'UTF-8' | 'ASCII' | 'UTF-16'>('UTF-8');
  const [bytesPerLine] = useState(16);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  const encodeData = (str: string, enc: string): Uint8Array => {
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
  };

  const bytes = encodeData(data, encoding);

  const handleByteMouseDown = (byteIndex: number) => {
    setSelectionStart(byteIndex);
    setIsSelecting(true);
    setSelectedBytes(new Set([byteIndex]));
  };

  const handleByteMouseEnter = (byteIndex: number) => {
    if (isSelecting && selectionStart !== null) {
      const start = Math.min(selectionStart, byteIndex);
      const end = Math.max(selectionStart, byteIndex);
      const newSelection = new Set<number>();
      for (let i = start; i <= end; i++) {
        newSelection.add(i);
      }
      setSelectedBytes(newSelection);
    }
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
  };

  const handleGoto = () => {
    const offset = parseInt(gotoOffset, 16);
    if (!isNaN(offset) && offset >= 0 && offset < bytes.length) {
      setSelectedBytes(new Set([offset]));
      // Scroll to offset would require ref implementation
    }
  };

  const handleSearch = () => {
    if (!searchTerm) return;
    const searchBytes = new TextEncoder().encode(searchTerm);

    // Simple search - find first occurrence
    for (let i = 0; i <= bytes.length - searchBytes.length; i++) {
      let match = true;
      for (let j = 0; j < searchBytes.length; j++) {
        if (bytes[i + j] !== searchBytes[j]) {
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
  };

  const renderHexByte = (byteValue: number, byteIndex: number) => {
    const hex = byteValue.toString(16).padStart(2, '0').toUpperCase();
    const isSelected = selectedBytes.has(byteIndex);
    return (
      <InteractiveView
        key={byteIndex}
        onMouseDown={() => handleByteMouseDown(byteIndex)}
        onMouseEnter={() => handleByteMouseEnter(byteIndex)}
        style={[styles.byteBox, isSelected && styles.selectedByte]}
      >
        <Text style={[styles.hexByteText, isSelected && styles.selectedText]}>
          {hex}
        </Text>
      </InteractiveView>
    );
  };

  const renderAsciiByte = (byteValue: number, byteIndex: number) => {
    const ascii = (byteValue >= 32 && byteValue <= 126) ? String.fromCharCode(byteValue) : '.';
    const isSelected = selectedBytes.has(byteIndex);
    return (
      <InteractiveView
        key={byteIndex}
        onMouseDown={() => handleByteMouseDown(byteIndex)}
        onMouseEnter={() => handleByteMouseEnter(byteIndex)}
        style={[styles.asciiByteBox, isSelected && styles.selectedByte]}
      >
        <Text style={[styles.asciiByteText, isSelected && styles.selectedText]}>
          {ascii}
        </Text>
      </InteractiveView>
    );
  };

  const renderLine = (lineIndex: number) => {
    const offset = lineIndex * bytesPerLine;
    const lineBytes = bytes.slice(offset, offset + bytesPerLine);

    return (
      <View key={lineIndex} style={styles.hexRow}>
        <Text style={styles.offsetText}>
          {offset.toString(16).padStart(8, '0').toUpperCase()}
        </Text>
        <Text style={styles.spacer}>  </Text>

        <View style={styles.hexBytesContainer}>
          {Array.from(lineBytes).map((byte, idx) =>
            renderHexByte(byte, offset + idx)
          )}
          {/* Padding for incomplete lines */}
          {Array.from({ length: bytesPerLine - lineBytes.length }).map((_, idx) => (
            <View key={`pad-${idx}`} style={styles.byteBox}>
              <Text style={styles.hexByteText}>  </Text>
            </View>
          ))}
        </View>

        <Text style={styles.spacer}>  </Text>

        <View style={styles.asciiBytesContainer}>
          {Array.from(lineBytes).map((byte, idx) =>
            renderAsciiByte(byte, offset + idx)
          )}
        </View>
      </View>
    );
  };

  const totalLines = Math.ceil(bytes.length / bytesPerLine);

  return (
  <InteractiveView style={styles.container} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      {/* Controls */}
      <View style={styles.controls}>
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
            Size: {bytes.length} bytes | Selected: {selectedBytes.size} byte{selectedBytes.size !== 1 ? 's' : ''}
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
          {Array.from({ length: totalLines }).map((_, idx) => renderLine(idx))}
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
