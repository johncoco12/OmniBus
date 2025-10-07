import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

type BrokerType = 'rabbitmq' | 'azure-service-bus' | 'msmq' | 'activemq';

interface AddServerModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (connection: {
    name: string;
    type: BrokerType;
    connectionString: string;
  }) => void;
}

export default function AddServerModal({ visible, onClose, onAdd }: AddServerModalProps) {
  const [name, setName] = useState('');
  const [selectedType, setSelectedType] = useState<BrokerType>('rabbitmq');
  const [connectionString, setConnectionString] = useState('');

  const brokerTypes: { type: BrokerType; label: string; icon: string }[] = [
    { type: 'rabbitmq', label: 'RabbitMQ', icon: 'dns' },
    // { type: 'azure-service-bus', label: 'Azure Service Bus', icon: 'cloud' }, // Soon
  ];

  const handleAdd = () => {
    if (!name.trim() || !connectionString.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    onAdd({
      name: name.trim(),
      type: selectedType,
      connectionString: connectionString.trim(),
    });

    // Reset form
    setName('');
    setConnectionString('');
    setSelectedType('rabbitmq');
  };

  const getPlaceholder = (type: BrokerType): string => {
    switch (type) {
      case 'rabbitmq':
        return 'ws://username:password@host:15674/ws;http://username:password@host:15672';
      case 'azure-service-bus':
        return 'Endpoint=sb://...;SharedAccessKeyName=...;SharedAccessKey=...';
      default:
        return 'Enter connection string';
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Add New Server</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialIcons name="close" size={24} color="#cccccc" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {/* Server Name */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Server Name *</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="My RabbitMQ Server"
                placeholderTextColor="#666"
              />
            </View>

            {/* Server Type */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Server Type *</Text>
              <View style={styles.typeGrid}>
                {brokerTypes.map((broker) => (
                  <TouchableOpacity
                    key={broker.type}
                    style={[
                      styles.typeCard,
                      selectedType === broker.type && styles.typeCardSelected,
                    ]}
                    onPress={() => setSelectedType(broker.type)}
                  >
                    <MaterialIcons
                      name={broker.icon as any}
                      size={32}
                      color={selectedType === broker.type ? '#007acc' : '#cccccc'}
                    />
                    <Text
                      style={[
                        styles.typeLabel,
                        selectedType === broker.type && styles.typeLabelSelected,
                      ]}
                    >
                      {broker.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Connection String */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Connection String *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={connectionString}
                onChangeText={setConnectionString}
                placeholder={getPlaceholder(selectedType)}
                placeholderTextColor="#666"
                multiline
                numberOfLines={3}
              />
              <Text style={styles.hint}>
                {selectedType === 'rabbitmq' &&
                  'Format: WebSocket URL;Management API URL'}
                {selectedType === 'azure-service-bus' &&
                  'Use connection string from Azure Portal'}
                {selectedType === 'msmq' && 'Use MSMQ format name'}
                {selectedType === 'activemq' && 'WebSocket STOMP endpoint'}
              </Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addButton} onPress={handleAdd}>
              <Text style={styles.addButtonText}>Add Server</Text>
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
  modalContainer: {
    width: '90%',
    maxWidth: 600,
    backgroundColor: '#2d2d30',
    borderRadius: 8,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#3e3e42',
  },
  title: {
    color: '#cccccc',
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    color: '#cccccc',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1e1e1e',
    color: '#cccccc',
    padding: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#3e3e42',
    fontSize: 14,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  hint: {
    color: '#858585',
    fontSize: 12,
    marginTop: 6,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  typeCard: {
    flex: 1,
    minWidth: 120,
    backgroundColor: '#1e1e1e',
    padding: 16,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#3e3e42',
    alignItems: 'center',
    gap: 8,
  },
  typeCardSelected: {
    borderColor: '#007acc',
    backgroundColor: '#094771',
  },
  typeLabel: {
    color: '#cccccc',
    fontSize: 13,
    textAlign: 'center',
  },
  typeLabelSelected: {
    color: '#007acc',
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#3e3e42',
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 4,
    backgroundColor: '#3e3e42',
  },
  cancelButtonText: {
    color: '#cccccc',
    fontSize: 14,
    fontWeight: '500',
  },
  addButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 4,
    backgroundColor: '#007acc',
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
