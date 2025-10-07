import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, TextInput, Modal, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface AddMessageModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (message: { body: string; messageId?: string }) => void;
  queueName?: string;
}

export default function AddMessageModal({ visible, onClose, onAdd, queueName }: AddMessageModalProps) {
  const [messageBody, setMessageBody] = useState('{\n  \n}');
  const [messageId, setMessageId] = useState('');

  const handleAdd = () => {
    try {
      // Validate JSON
      JSON.parse(messageBody);
      onAdd({
        body: messageBody,
        messageId: messageId.trim() || undefined,
      });
      setMessageBody('{\n  \n}');
      setMessageId('');
    } catch (error) {
      alert('Invalid JSON format');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Add Message to {queueName || 'Queue'}</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialIcons name="close" size={20} color="#cccccc" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            <View style={styles.field}>
              <Text style={styles.label}>Message ID (optional)</Text>
              <TextInput
                style={styles.input}
                value={messageId}
                onChangeText={setMessageId}
                placeholder="Auto-generated if empty"
                placeholderTextColor="#858585"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Message Body (JSON)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={messageBody}
                onChangeText={setMessageBody}
                placeholder='{"key": "value"}'
                placeholderTextColor="#858585"
                multiline
                numberOfLines={10}
              />
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addButton} onPress={handleAdd}>
              <Text style={styles.addButtonText}>Send Message</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: 600,
    maxHeight: '80%',
    backgroundColor: '#252526',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3e3e42',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#3e3e42',
  },
  title: {
    color: '#cccccc',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    padding: 16,
    maxHeight: 400,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    color: '#cccccc',
    fontSize: 13,
    marginBottom: 6,
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#3e3e42',
    color: '#cccccc',
    padding: 10,
    borderRadius: 4,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#3e3e42',
  },
  textArea: {
    minHeight: 200,
    textAlignVertical: 'top',
    fontFamily: 'monospace',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#3e3e42',
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    backgroundColor: '#3e3e42',
  },
  cancelButtonText: {
    color: '#cccccc',
    fontSize: 13,
  },
  addButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    backgroundColor: '#0e639c',
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
  },
});
