import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { serviceBusManager } from '../sources/services/shared';

interface MoveMessageModalProps {
  visible: boolean;
  onClose: () => void;
  onMove: (targetQueue: string) => void;
  connectionId: string;
  sourceQueue: string;
}

export default function MoveMessageModal({ visible, onClose, onMove, connectionId, sourceQueue }: MoveMessageModalProps) {
  const [queues, setQueues] = useState<string[]>([]);
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null);

  useEffect(() => {
    if (visible && connectionId) {
      loadQueues();
    }
  }, [visible, connectionId]);

  const loadQueues = async () => {
    try {
      const service = serviceBusManager.getService(connectionId);
      if (service) {
        const queueList = await service.getQueues();
        // Filter out the source queue
        const availableQueues = queueList
          .map(q => q.name)
          .filter(name => name !== sourceQueue);
        setQueues(availableQueues);
      }
    } catch (error) {
      console.error('Failed to load queues:', error);
    }
  };

  const handleMove = () => {
    if (selectedQueue) {
      onMove(selectedQueue);
      setSelectedQueue(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Move Message</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialIcons name="close" size={20} color="#cccccc" />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <Text style={styles.description}>
              Select target queue to move message from <Text style={styles.highlight}>{sourceQueue}</Text>
            </Text>

            <ScrollView style={styles.queueList}>
              {queues.length === 0 ? (
                <Text style={styles.emptyText}>No other queues available</Text>
              ) : (
                queues.map((queue) => (
                  <TouchableOpacity
                    key={queue}
                    style={[
                      styles.queueItem,
                      selectedQueue === queue && styles.selectedQueueItem,
                    ]}
                    onPress={() => setSelectedQueue(queue)}
                  >
                    <MaterialIcons
                      name={selectedQueue === queue ? 'radio-button-checked' : 'radio-button-unchecked'}
                      size={18}
                      color={selectedQueue === queue ? '#4fc3f7' : '#858585'}
                    />
                    <Text style={styles.queueName}>{queue}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.moveButton, !selectedQueue && styles.disabledButton]}
              onPress={handleMove}
              disabled={!selectedQueue}
            >
              <Text style={styles.moveButtonText}>Move</Text>
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
    width: 500,
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
  },
  description: {
    color: '#cccccc',
    fontSize: 13,
    marginBottom: 16,
  },
  highlight: {
    color: '#4fc3f7',
    fontWeight: '600',
  },
  queueList: {
    maxHeight: 300,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 4,
    marginBottom: 4,
    gap: 8,
  },
  selectedQueueItem: {
    backgroundColor: '#094771',
  },
  queueName: {
    color: '#cccccc',
    fontSize: 13,
  },
  emptyText: {
    color: '#858585',
    fontSize: 13,
    textAlign: 'center',
    padding: 20,
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
  moveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    backgroundColor: '#0e639c',
  },
  disabledButton: {
    opacity: 0.5,
  },
  moveButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
  },
});
