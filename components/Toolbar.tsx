import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, TextInput } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';

interface ToolbarProps {
  onAddMessage?: () => void;
  onEditMessage?: () => void;
  onDeleteMessage?: () => void;
  onMoveMessage?: () => void;
  onRefresh?: () => void;
  onCopy?: () => void;
  selectedMessage?: any;
  selectedQueue?: { connectionId: string; queueName: string } | null;
}

export default function Toolbar({
  onAddMessage,
  onEditMessage,
  onDeleteMessage,
  onMoveMessage,
  onRefresh,
  onCopy,
  selectedMessage,
  selectedQueue,
}: ToolbarProps) {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState('5');

  // Auto-refresh functionality
  useEffect(() => {
    if (autoRefresh && onRefresh) {
      const interval = parseInt(refreshInterval) || 10;
      const timer = setInterval(() => {
        onRefresh();
      }, interval * 1000);

      return () => clearInterval(timer);
    }
  }, [autoRefresh, refreshInterval, onRefresh]);

  const hasQueue = !!selectedQueue;
  const hasMessage = !!selectedMessage;

  return (
    <View style={styles.container}>
      <View style={styles.leftSection}>
        <TouchableOpacity
          style={[styles.iconButton, !hasQueue && styles.disabledButton]}
          onPress={onAddMessage}
          disabled={!hasQueue}
        >
          <MaterialIcons name="add" size={18} color={hasQueue ? "#cccccc" : "#555555"} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconButton, !hasMessage && styles.disabledButton]}
          onPress={onEditMessage}
          disabled={!hasMessage}
        >
          <MaterialIcons name="edit" size={18} color={hasMessage ? "#cccccc" : "#555555"} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconButton, !hasMessage && styles.disabledButton]}
          onPress={onDeleteMessage}
          disabled={!hasMessage}
        >
          <MaterialIcons name="delete-outline" size={18} color={hasMessage ? "#cccccc" : "#555555"} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconButton, !hasMessage && styles.disabledButton]}
          onPress={onMoveMessage}
          disabled={!hasMessage}
        >
          <MaterialCommunityIcons name="folder-move" size={18} color={hasMessage ? "#cccccc" : "#555555"} />
        </TouchableOpacity>
        <View style={styles.separator} />
        <TouchableOpacity
          style={[styles.iconButton, !hasQueue && styles.disabledButton]}
          onPress={onRefresh}
          disabled={!hasQueue}
        >
          <MaterialIcons name="refresh" size={18} color={hasQueue ? "#cccccc" : "#555555"} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconButton, !hasMessage && styles.disabledButton]}
          onPress={onCopy}
          disabled={!hasMessage}
        >
          <MaterialIcons name="content-copy" size={18} color={hasMessage ? "#cccccc" : "#555555"} />
        </TouchableOpacity>
      </View>

      <View style={styles.rightSection}>
        <View style={styles.autoRefreshControl}>
          <TouchableOpacity
            style={styles.checkbox}
            onPress={() => setAutoRefresh(!autoRefresh)}
            disabled={!hasQueue}
          >
            <MaterialIcons
              name={autoRefresh ? "check-box" : "check-box-outline-blank"}
              size={18}
              color={hasQueue ? "#cccccc" : "#555555"}
            />
          </TouchableOpacity>
          <Text style={[styles.label, !hasQueue && styles.disabledText]}>Auto-refresh every</Text>
          <TextInput
            style={[styles.input, !hasQueue && styles.disabledInput]}
            value={refreshInterval}
            onChangeText={setRefreshInterval}
            keyboardType="numeric"
            editable={hasQueue}
          />
          <Text style={[styles.label, !hasQueue && styles.disabledText]}>s</Text>
        </View>
        <TouchableOpacity
          style={[styles.button, !hasQueue && styles.disabledButton]}
          onPress={onRefresh}
          disabled={!hasQueue}
        >
          <Text style={[styles.buttonText, !hasQueue && styles.disabledText]}>Refresh</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2d2d30',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#3e3e42',
  },
  leftSection: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  separator: {
    width: 1,
    height: 24,
    backgroundColor: '#3e3e42',
    marginHorizontal: 4,
  },
  iconButton: {
    padding: 6,
    borderRadius: 3,
    backgroundColor: '#3e3e42',
  },
  disabledButton: {
    opacity: 0.5,
  },
  disabledText: {
    color: '#555555',
  },
  disabledInput: {
    opacity: 0.5,
  },
  autoRefreshControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  checkbox: {
    padding: 2,
  },
  input: {
    backgroundColor: '#3e3e42',
    color: '#cccccc',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
    width: 50,
    fontSize: 13,
    textAlign: 'center',
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#3e3e42',
    borderRadius: 3,
  },
  buttonText: {
    color: '#cccccc',
    fontSize: 13,
  },
  limitControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    color: '#cccccc',
    fontSize: 13,
  },
  dropdown: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#3e3e42',
    borderRadius: 3,
  },
  dropdownText: {
    color: '#cccccc',
    fontSize: 13,
  },
});
