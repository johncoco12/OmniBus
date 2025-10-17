import React, { useState, useRef } from 'react';
import { StyleSheet, View, Alert } from 'react-native';
import Sidebar from './Sidebar';
import MessageList from './MessageList';
import MessageViewer from './MessageViewer';
import Toolbar from './Toolbar';
import AddMessageModal from './AddMessageModal';
import MoveMessageModal from './MoveMessageModal';
import EditMessageModal from './EditMessageModal';
import { serviceBusManager } from '../sources/services/shared';

export default function OmniBus() {
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [selectedQueue, setSelectedQueue] = useState<{ connectionId: string; queueName: string } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleAddMessage = async (message: { body: string; messageId?: string }) => {
    if (!selectedQueue) {
      console.error('No queue selected');
      return;
    }

    console.log('=== handleAddMessage ===');
    console.log('Selected queue:', selectedQueue);
    console.log('Message body string:', message.body);

    try {
      const service = serviceBusManager.getService(selectedQueue.connectionId);
      console.log('Service found:', !!service);

      if (!service) {
        throw new Error('Service not found');
      }

      const messageBody = JSON.parse(message.body);
      console.log('Parsed message body:', messageBody);

      await service.sendMessage(selectedQueue.queueName, messageBody);

      console.log('Message sent successfully');
      setShowAddModal(false);
      setRefreshTrigger(prev => prev + 1);
      Alert.alert('Success', 'Message sent successfully');
    } catch (error: any) {
      console.error('Failed to send message:', error);
      Alert.alert('Error', `Failed to send message: ${error.message}`);
    }
  };

  const handleDeleteMessage = async () => {
    if (!selectedMessage || !selectedQueue) return;

    if (!confirm(`Are you sure you want to delete this message?`)) {
      return;
    }

    try {
      const service = serviceBusManager.getService(selectedQueue.connectionId);
      if (!service) {
        throw new Error('Service not found');
      }

      await service.deleteMessage(selectedQueue.queueName, selectedMessage.id);

      setSelectedMessage(null);
      setRefreshTrigger(prev => prev + 1);
      Alert.alert('Success', 'Message deleted successfully');
    } catch (error: any) {
      Alert.alert('Error', `Failed to delete message: ${error.message}`);
    }
  };

  const handleMoveMessage = async (targetQueue: string) => {
    if (!selectedMessage || !selectedQueue) return;

    try {
      const service = serviceBusManager.getService(selectedQueue.connectionId);
      if (!service) {
        throw new Error('Service not found');
      }

      await service.moveMessage(selectedQueue.queueName, targetQueue, selectedMessage.id);

      setShowMoveModal(false);
      setSelectedMessage(null);
      setRefreshTrigger(prev => prev + 1);
      Alert.alert('Success', `Message moved to ${targetQueue}`);
    } catch (error: any) {
      Alert.alert('Error', `Failed to move message: ${error.message}`);
    }
  };

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleCopy = () => {
    if (!selectedMessage) return;

    const jsonString = JSON.stringify(selectedMessage.body, null, 2);
    navigator.clipboard.writeText(jsonString);
    Alert.alert('Copied', 'Message body copied to clipboard');
  };

  const handleEditMessage = () => {
    if (!selectedMessage) return;
    setShowEditModal(true);
  };

  const handleSaveEditedMessage = async (updatedBody: string) => {
    if (!selectedMessage || !selectedQueue) return;

    try {
      const service = serviceBusManager.getService(selectedQueue.connectionId);
      if (!service) {
        throw new Error('Service not found');
      }

      // Parse the updated body
      const newBody = JSON.parse(updatedBody);

      // Delete the old message and send the updated one
      // This is a workaround since RabbitMQ doesn't support in-place editing
      await service.deleteMessage(selectedQueue.queueName, selectedMessage.id);
      await service.sendMessage(selectedQueue.queueName, newBody);

      setShowEditModal(false);
      setSelectedMessage(null);
      setRefreshTrigger(prev => prev + 1);
      Alert.alert('Success', 'Message updated successfully');
    } catch (error: any) {
      Alert.alert('Error', `Failed to update message: ${error.message}`);
    }
  };

  return (
    <View style={styles.container}>
      <Toolbar
        onAddMessage={() => setShowAddModal(true)}
        onEditMessage={handleEditMessage}
        onDeleteMessage={handleDeleteMessage}
        onMoveMessage={() => setShowMoveModal(true)}
        onRefresh={handleRefresh}
        onCopy={handleCopy}
        selectedMessage={selectedMessage}
        selectedQueue={selectedQueue}
      />
      <View style={styles.mainContent}>
        <Sidebar onQueueSelect={setSelectedQueue} />
        <View style={styles.rightPanel}>
          <MessageList
            onSelectMessage={setSelectedMessage}
            selectedMessage={selectedMessage}
            selectedQueue={selectedQueue}
            refreshTrigger={refreshTrigger}
          />
          <MessageViewer message={selectedMessage} />
        </View>
      </View>

      <AddMessageModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddMessage}
        queueName={selectedQueue?.queueName}
      />

      {selectedQueue && (
        <MoveMessageModal
          visible={showMoveModal}
          onClose={() => setShowMoveModal(false)}
          onMove={handleMoveMessage}
          connectionId={selectedQueue.connectionId}
          sourceQueue={selectedQueue.queueName}
        />
      )}

      <EditMessageModal
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSave={handleSaveEditedMessage}
        message={selectedMessage}
        queueName={selectedQueue?.queueName}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
  },
  rightPanel: {
    flex: 1,
    flexDirection: 'column',
  },
});
