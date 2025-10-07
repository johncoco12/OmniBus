import React, { useEffect, useState, useMemo } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { serviceBusManager } from '../sources/services/shared';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import EditMessageModal from './EditMessageModal';
import MoveMessageModal from './MoveMessageModal';

interface Message {
  id: string;
  sequenceNumber: string;
  label: string;
  size: number;
  enqueuedTime: string;
  deliveryCount: number;
  invoiceAmount: number;
  body: any;
}

type FilterColumn = 'sequenceNumber' | 'label' | 'size' | 'enqueuedTime' | 'deliveryCount' | 'properties';
type SortDirection = 'asc' | 'desc' | null;

interface MessageListProps {
  onSelectMessage: (message: Message) => void;
  selectedMessage: Message | null;
  selectedQueue: { connectionId: string; queueName: string } | null;
  refreshTrigger?: number;
}

export default function MessageList({ onSelectMessage, selectedMessage, selectedQueue, refreshTrigger }: MessageListProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<FilterColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [filterText, setFilterText] = useState('');
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; message: Message | null }>({
    visible: false,
    x: 0,
    y: 0,
    message: null,
  });
  const [clipboard, setClipboard] = useState<{ message: Message; cut: boolean } | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [localRefreshTrigger, setLocalRefreshTrigger] = useState(0);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [movingMessageIds, setMovingMessageIds] = useState<string[]>([]);

  // Helper function to refresh messages
  const refreshMessages = async () => {
    if (!selectedQueue) return;

    setLoading(true);
    setError(null);
    try {
      console.log(`Fetching messages for queue: ${selectedQueue.queueName} from connection: ${selectedQueue.connectionId}`);

      const service = serviceBusManager.getService(selectedQueue.connectionId);
      if (!service) {
        throw new Error(`Service not found for connection: ${selectedQueue.connectionId}`);
      }

      const rawMessages = await service.getMessages(selectedQueue.queueName);
      console.log(`✓ Fetched ${rawMessages.length} messages from queue ${selectedQueue.queueName}`);

      // Transform raw messages to UI format
      const transformedMessages: Message[] = rawMessages.map((msg, index) => {
        // Guard timestamp which may be undefined for some brokers
        let timeStr: string;
          if (msg.timestamp) {
            try {
              timeStr = new Date(msg.timestamp as any).toLocaleString();
            } catch {
              timeStr = new Date().toLocaleString();
            }
          } else if (msg.enqueuedTime) {
            // fallback if original message object already has a string date
            try {
              timeStr = new Date(msg.enqueuedTime).toLocaleString();
            } catch {
              timeStr = msg.enqueuedTime as string;
            }
          } else {
            timeStr = new Date().toLocaleString();
          }
        return {
          id: msg.id,
          sequenceNumber: String(index + 1),
          label: msg.properties?.messageId || msg.id,
          size: JSON.stringify(msg.body).length,
          enqueuedTime: timeStr,
          deliveryCount: msg.redelivered ? 1 : 0,
          invoiceAmount: msg.body?.totalNet?.value || 0,
          body: msg.body,
        };
      });

      setMessages(transformedMessages);
    } catch (err) {
      console.error('✗ Error fetching messages:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch messages');
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedQueue) {
      setMessages([]);
      return;
    }

    refreshMessages();
  }, [selectedQueue, refreshTrigger, localRefreshTrigger]);

  // Keyboard shortcuts for Copy/Cut/Paste and ESC to clear selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC to clear selection
      if (e.key === 'Escape') {
        e.preventDefault();
        handleDeselectAll();
        return;
      }

      if (!selectedMessage) return;

      // Check if Ctrl/Cmd key is pressed
      const modifier = e.ctrlKey || e.metaKey;

      if (modifier && e.key === 'c') {
        e.preventDefault();
        setClipboard({ message: selectedMessage, cut: false });
        console.log('✓ Message copied (Ctrl+C)');
      } else if (modifier && e.key === 'x') {
        e.preventDefault();
        setClipboard({ message: selectedMessage, cut: true });
        console.log('✓ Message cut (Ctrl+X)');
      } else if (modifier && e.key === 'v' && clipboard) {
        e.preventDefault();
        handlePaste();
      } else if (modifier && e.key === 'a') {
        e.preventDefault();
        handleSelectAll();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedMessage, clipboard, selectedMessages]);

  const handleSort = (column: FilterColumn) => {
    if (sortColumn === column) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortColumn(null);
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleContextMenu = (event: any, message: Message) => {
    event.preventDefault();
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      message,
    });
  };

  const handleCopyMessage = () => {
    if (contextMenu.message) {
      navigator.clipboard.writeText(JSON.stringify(contextMenu.message.body, null, 2));
    }
  };

  const handleCopy = () => {
    if (contextMenu.message) {
      setClipboard({ message: contextMenu.message, cut: false });
      console.log('✓ Message copied to clipboard');
    }
  };

  const handleCut = () => {
    if (contextMenu.message) {
      setClipboard({ message: contextMenu.message, cut: true });
      console.log('✓ Message cut to clipboard');
    }
  };

  const handlePaste = async () => {
    if (!clipboard || !selectedQueue) return;

    try {
      const service = serviceBusManager.getService(selectedQueue.connectionId);
      if (!service) {
        throw new Error('Service not found');
      }

      // Send the message to the current queue
      await service.sendMessage(selectedQueue.queueName, clipboard.message.body);

      // If it was cut, delete from original location
      if (clipboard.cut) {
        await service.deleteMessage(selectedQueue.queueName, clipboard.message.id);
        setMessages(prev => prev.filter(m => m.id !== clipboard.message.id));
        setClipboard(null);
      }

      console.log('✓ Message pasted');

      // Refresh to show new message
      setTimeout(() => {
        setLocalRefreshTrigger(Date.now());
      }, 500);
    } catch (error) {
      console.error('Failed to paste message:', error);
      alert(`Failed to paste message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleEditMessage = () => {
    if (contextMenu.message) {
      setEditingMessage(contextMenu.message);
      setShowEditModal(true);
    }
  };

  const handleSaveEdit = async (updatedBody: string) => {
    if (!editingMessage || !selectedQueue) return;

    try {
      const service = serviceBusManager.getService(selectedQueue.connectionId);
      if (!service) {
        throw new Error('Service not found');
      }

      const parsedBody = JSON.parse(updatedBody);

      // Delete old message
      await service.deleteMessage(selectedQueue.queueName, editingMessage.id);

      // Send updated message
      await service.sendMessage(selectedQueue.queueName, parsedBody);

      console.log('✓ Message updated');

      setShowEditModal(false);
      setEditingMessage(null);

      // Refresh messages
      setTimeout(() => {
        setLocalRefreshTrigger(Date.now());
      }, 500);
    } catch (error) {
      console.error('Failed to edit message:', error);
      alert(`Failed to edit message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDeleteMessage = async () => {
    if (!contextMenu.message || !selectedQueue) return;

    try {
      const service = serviceBusManager.getService(selectedQueue.connectionId);
      if (!service) {
        throw new Error('Service not found');
      }

      await service.deleteMessage(selectedQueue.queueName, contextMenu.message.id);

      // Refresh messages
      setMessages(prev => prev.filter(m => m.id !== contextMenu.message?.id));

      console.log(`✓ Message ${contextMenu.message.id} deleted`);
    } catch (error) {
      console.error('Failed to delete message:', error);
      alert(`Failed to delete message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleOpenMoveModal = (messageIds: string[]) => {
    setMovingMessageIds(messageIds);
    setShowMoveModal(true);
  };

  const handleMoveMessages = async (targetQueue: string) => {
    if (!selectedQueue || movingMessageIds.length === 0) return;

    try {
      const service = serviceBusManager.getService(selectedQueue.connectionId);
      if (!service) {
        throw new Error('Service not found');
      }

      let successCount = 0;
      let failCount = 0;

      // Use bulk move if available and moving multiple messages
      if (service.bulkMoveMessages && movingMessageIds.length > 1) {
        const result = await service.bulkMoveMessages(selectedQueue.queueName, targetQueue, movingMessageIds);
        successCount = result.successCount;
        failCount = result.failCount;
      } else {
        // Single message or sequential move
        for (const messageId of movingMessageIds) {
          try {
            await service.moveMessage(selectedQueue.queueName, targetQueue, messageId);
            successCount++;
          } catch (error) {
            console.error(`Failed to move message ${messageId}:`, error);
            failCount++;
          }
        }
      }

      // Refresh messages
      setMessages(prev => prev.filter(m => !movingMessageIds.includes(m.id)));
      setSelectedMessages(new Set());
      setShowMoveModal(false);
      setMovingMessageIds([]);

      if (failCount > 0) {
        console.log(`✓ Moved ${successCount} messages to ${targetQueue}, ${failCount} failed`);
        alert(`Moved ${successCount} message(s) to ${targetQueue}, but ${failCount} failed.`);
      } else {
        console.log(`✓ Moved ${successCount} message(s) to ${targetQueue}`);
      }
    } catch (error) {
      console.error('Failed to move messages:', error);
      alert(`Failed to move messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleMessageClick = (message: Message, event?: any) => {
    if (event?.ctrlKey || event?.metaKey) {
      // Ctrl/Cmd + Click: Toggle individual selection
      event.preventDefault();
      setSelectedMessages(prev => {
        const newSet = new Set(prev);
        if (newSet.has(message.id)) {
          newSet.delete(message.id);
        } else {
          newSet.add(message.id);
        }
        return newSet;
      });
      onSelectMessage(message);
    } else if (event?.shiftKey && selectedMessage) {
      // Shift + Click: Select range
      event.preventDefault();
      const currentIndex = filteredAndSortedMessages.findIndex(m => m.id === selectedMessage.id);
      const clickedIndex = filteredAndSortedMessages.findIndex(m => m.id === message.id);

      if (currentIndex !== -1 && clickedIndex !== -1) {
        const start = Math.min(currentIndex, clickedIndex);
        const end = Math.max(currentIndex, clickedIndex);
        const range = filteredAndSortedMessages.slice(start, end + 1).map(m => m.id);
        setSelectedMessages(new Set(range));
      }
      onSelectMessage(message);
    } else {
      // Regular click: Just select the message for viewing, clear multi-select
      setSelectedMessages(new Set());
      onSelectMessage(message);
    }
  };

  const handleSelectAll = () => {
    setSelectedMessages(new Set(filteredAndSortedMessages.map(m => m.id)));
  };

  const handleDeselectAll = () => {
    setSelectedMessages(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedMessages.size === 0 || !selectedQueue) return;

    if (!confirm(`Are you sure you want to delete ${selectedMessages.size} message(s)?`)) {
      return;
    }

    try {
      const service = serviceBusManager.getService(selectedQueue.connectionId);
      if (!service) {
        throw new Error('Service not found');
      }

      let successCount = 0;
      let failCount = 0;

      // Use bulk delete if available (RabbitMQ), otherwise fall back to sequential deletion
      if (service.bulkDeleteMessages) {
        const result = await service.bulkDeleteMessages(selectedQueue.queueName, Array.from(selectedMessages));
        successCount = result.successCount;
        failCount = result.failCount;
      } else {
        // Delete messages sequentially for services that don't support bulk delete
        for (const messageId of Array.from(selectedMessages)) {
          try {
            await service.deleteMessage(selectedQueue.queueName, messageId);
            successCount++;
          } catch (error) {
            console.error(`Failed to delete message ${messageId}:`, error);
            failCount++;
          }
        }
      }

      // Refresh messages
      setMessages(prev => prev.filter(m => !selectedMessages.has(m.id)));
      setSelectedMessages(new Set());

      if (failCount > 0) {
        console.log(`✓ Deleted ${successCount} messages, ${failCount} failed`);
        alert(`Deleted ${successCount} message(s), but ${failCount} failed. The queue will be refreshed.`);
      } else {
        console.log(`✓ Deleted ${successCount} messages`);
      }
    } catch (error) {
      console.error('Failed to delete messages:', error);
      alert(`Failed to delete messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleBulkMove = () => {
    if (selectedMessages.size === 0) return;
    handleOpenMoveModal(Array.from(selectedMessages));
  };

  const handleBulkCopy = () => {
    const messagesToCopy = messages.filter(m => selectedMessages.has(m.id));
    const jsonArray = messagesToCopy.map(m => m.body);
    navigator.clipboard.writeText(JSON.stringify(jsonArray, null, 2));
    console.log(`✓ Copied ${selectedMessages.size} messages to clipboard`);
  };

  const handleExportSingle = async () => {
    if (!contextMenu.message || !selectedQueue) return;

    try {
      const service = serviceBusManager.getService(selectedQueue.connectionId);
      if (!service) {
        throw new Error('Service not found');
      }

      // Use service export if available, otherwise export directly
      let exportData: any[];
      if (service.exportMessages) {
        exportData = await service.exportMessages(selectedQueue.queueName, [contextMenu.message.id]);
      } else {
        exportData = [contextMenu.message.body];
      }

      const json = JSON.stringify(exportData[0], null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `message-${contextMenu.message.id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log(`✓ Exported message to message-${contextMenu.message.id}.json`);
    } catch (error) {
      console.error('Failed to export message:', error);
      alert(`Failed to export message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleExportBulk = async () => {
    if (selectedMessages.size === 0 || !selectedQueue) return;

    try {
      const service = serviceBusManager.getService(selectedQueue.connectionId);
      if (!service) {
        throw new Error('Service not found');
      }

      // Use service export if available, otherwise export directly
      let exportData: any[];
      if (service.exportMessages) {
        exportData = await service.exportMessages(selectedQueue.queueName, Array.from(selectedMessages));
      } else {
        const messagesToExport = messages.filter(m => selectedMessages.has(m.id));
        exportData = messagesToExport.map(m => m.body);
      }

      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `messages-export-${selectedMessages.size}-items.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log(`✓ Exported ${selectedMessages.size} messages to JSON file`);
    } catch (error) {
      console.error('Failed to export messages:', error);
      alert(`Failed to export messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleImportSingle = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file || !selectedQueue) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        const service = serviceBusManager.getService(selectedQueue.connectionId);
        if (!service) {
          throw new Error('Service not found');
        }

        // Use service import if available, otherwise send directly
        if (service.importMessages) {
          const result = await service.importMessages(selectedQueue.queueName, [data]);
          console.log(`✓ Imported ${result.successCount} message(s) from ${file.name}, ${result.failCount} failed`);
        } else {
          await service.sendMessage(selectedQueue.queueName, data);
          console.log(`✓ Imported and sent message from ${file.name}`);
        }

        // Refresh messages
        setTimeout(() => {
          setLocalRefreshTrigger(Date.now());
        }, 500);
      } catch (error) {
        console.error('Failed to import message:', error);
        alert(`Failed to import message: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };
    input.click();
  };

  const handleImportBulk = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file || !selectedQueue) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        // Check if it's an array
        const messagesToImport = Array.isArray(data) ? data : [data];

        const service = serviceBusManager.getService(selectedQueue.connectionId);
        if (!service) {
          throw new Error('Service not found');
        }

        // Use service import if available, otherwise send directly
        if (service.importMessages) {
          const result = await service.importMessages(selectedQueue.queueName, messagesToImport);
          console.log(`✓ Imported ${result.successCount} message(s) from ${file.name}, ${result.failCount} failed`);

          if (result.failCount > 0) {
            alert(`Imported ${result.successCount} message(s), but ${result.failCount} failed. The queue will be refreshed.`);
          }
        } else {
          // Fall back to sequential sending
          const sendPromises = messagesToImport.map(msg => service.sendMessage(selectedQueue.queueName, msg));
          await Promise.all(sendPromises);
          console.log(`✓ Imported and sent ${messagesToImport.length} message(s) from ${file.name}`);
        }

        // Refresh messages
        setTimeout(() => {
          setLocalRefreshTrigger(Date.now());
        }, 500);
      } catch (error) {
        console.error('Failed to import messages:', error);
        alert(`Failed to import messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };
    input.click();
  };

  const contextMenuItems: ContextMenuItem[] = selectedMessages.size > 1 ? [
    // Bulk actions menu
    {
      label: `${selectedMessages.size} Messages Selected`,
      icon: 'check-box',
      onPress: () => {},
    },
    {
      label: 'Copy All',
      icon: 'content-copy',
      onPress: handleBulkCopy,
      separator: true,
    },
    {
      label: 'Export All to JSON',
      icon: 'download',
      onPress: handleExportBulk,
    },
    {
      label: 'Move All to...',
      icon: 'drive-file-move',
      onPress: handleBulkMove,
      separator: true,
    },
    {
      label: 'Delete All',
      icon: 'delete',
      onPress: handleBulkDelete,
      danger: true,
      separator: true,
    },
    {
      label: 'Deselect All',
      icon: 'clear',
      onPress: handleDeselectAll,
    },
  ] : [
    // Single message menu
    {
      label: 'Edit',
      icon: 'edit',
      onPress: handleEditMessage,
    },
    {
      label: 'Copy',
      icon: 'content-copy',
      onPress: handleCopy,
    },
    {
      label: 'Cut',
      icon: 'content-cut',
      onPress: handleCut,
    },
    {
      label: 'Paste',
      icon: 'content-paste',
      onPress: handlePaste,
      separator: true,
    },
    {
      label: 'Export to JSON',
      icon: 'download',
      onPress: handleExportSingle,
    },
    {
      label: 'Import from JSON',
      icon: 'upload',
      onPress: handleImportSingle,
      separator: true,
    },
    {
      label: 'Copy Body (Text)',
      icon: 'text-snippet',
      onPress: handleCopyMessage,
    },
    {
      label: 'View Details',
      icon: 'info',
      onPress: () => {
        if (contextMenu.message) {
          onSelectMessage(contextMenu.message);
        }
      },
    },
    {
      label: 'Move to...',
      icon: 'drive-file-move',
      onPress: () => {
        if (contextMenu.message) {
          handleOpenMoveModal([contextMenu.message.id]);
        }
      },
      separator: true,
    },
    {
      label: 'Delete Message',
      icon: 'delete',
      onPress: () => {
        if (confirm('Are you sure you want to delete this message?')) {
          handleDeleteMessage();
        }
      },
      danger: true,
    },
  ];

  const filteredAndSortedMessages = useMemo(() => {
    let result = [...messages];

    // Apply text filter
    if (filterText.trim()) {
      const searchLower = filterText.toLowerCase();
      result = result.filter(msg =>
        msg.label.toLowerCase().includes(searchLower) ||
        msg.sequenceNumber.toLowerCase().includes(searchLower) ||
        msg.enqueuedTime.toLowerCase().includes(searchLower) ||
        JSON.stringify(msg.body).toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    if (sortColumn && sortDirection) {
      result.sort((a, b) => {
        let aVal: any;
        let bVal: any;

        switch (sortColumn) {
          case 'sequenceNumber':
            aVal = parseInt(a.sequenceNumber);
            bVal = parseInt(b.sequenceNumber);
            break;
          case 'label':
            aVal = a.label;
            bVal = b.label;
            break;
          case 'size':
            aVal = a.size;
            bVal = b.size;
            break;
          case 'enqueuedTime':
            aVal = new Date(a.enqueuedTime).getTime();
            bVal = new Date(b.enqueuedTime).getTime();
            break;
          case 'deliveryCount':
            aVal = a.deliveryCount;
            bVal = b.deliveryCount;
            break;
          case 'properties':
            aVal = Object.keys(a.body || {}).length;
            bVal = Object.keys(b.body || {}).length;
            break;
          default:
            return 0;
        }

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [messages, sortColumn, sortDirection, filterText]);

  return (
    <View style={styles.container}>
      {selectedQueue && (
        <View style={styles.queueHeader}>
          <Text style={styles.queueName}>{selectedQueue.queueName}</Text>
          <View style={styles.queueHeaderRight}>
            <TouchableOpacity style={styles.importButton} onPress={handleImportBulk}>
              <MaterialIcons name="upload" size={16} color="#cccccc" />
              <Text style={styles.importButtonText}>Import JSON</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.searchInput}
              placeholder="Search messages..."
              placeholderTextColor="#858585"
              value={filterText}
              onChangeText={setFilterText}
            />
            <Text style={styles.messageCount}>
              {filteredAndSortedMessages.length} / {messages.length}
            </Text>
          </View>
        </View>
      )}

      {/* Bulk Actions Toolbar */}
      {selectedMessages.size > 0 && (
        <View style={styles.bulkToolbar}>
          <View style={styles.bulkToolbarLeft}>
            <MaterialIcons name="check-box" size={20} color="#4fc3f7" />
            <Text style={styles.bulkToolbarText}>{selectedMessages.size} selected</Text>
          </View>
          <View style={styles.bulkToolbarActions}>
            <TouchableOpacity style={styles.bulkButton} onPress={handleSelectAll}>
              <MaterialIcons name="select-all" size={16} color="#cccccc" />
              <Text style={styles.bulkButtonText}>Select All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bulkButton} onPress={handleDeselectAll}>
              <MaterialIcons name="clear" size={16} color="#cccccc" />
              <Text style={styles.bulkButtonText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bulkButton} onPress={handleBulkCopy}>
              <MaterialIcons name="content-copy" size={16} color="#cccccc" />
              <Text style={styles.bulkButtonText}>Copy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bulkButton} onPress={handleExportBulk}>
              <MaterialIcons name="download" size={16} color="#cccccc" />
              <Text style={styles.bulkButtonText}>Export</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bulkButton} onPress={handleBulkMove}>
              <MaterialIcons name="drive-file-move" size={16} color="#cccccc" />
              <Text style={styles.bulkButtonText}>Move</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bulkButton} onPress={handleBulkDelete}>
              <MaterialIcons name="delete" size={16} color="#f48771" />
              <Text style={[styles.bulkButtonText, styles.bulkButtonDanger]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.header}>
        <View style={styles.headerCellWrapper}>
          <Text style={[styles.headerCell, styles.sequenceCell]}>#</Text>
          <TouchableOpacity onPress={() => handleSort('sequenceNumber')}>
            <MaterialIcons
              name={sortColumn === 'sequenceNumber' ? (sortDirection === 'asc' ? 'arrow-upward' : 'arrow-downward') : 'filter-list'}
              size={14}
              color={sortColumn === 'sequenceNumber' ? '#4fc3f7' : '#858585'}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.headerCellWrapper}>
          <Text style={[styles.headerCell, styles.labelCell]}>Message ID</Text>
          <TouchableOpacity onPress={() => handleSort('label')}>
            <MaterialIcons
              name={sortColumn === 'label' ? (sortDirection === 'asc' ? 'arrow-upward' : 'arrow-downward') : 'filter-list'}
              size={14}
              color={sortColumn === 'label' ? '#4fc3f7' : '#858585'}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.headerCellWrapper}>
          <Text style={[styles.headerCell, styles.sizeCell]}>Size (bytes)</Text>
          <TouchableOpacity onPress={() => handleSort('size')}>
            <MaterialIcons
              name={sortColumn === 'size' ? (sortDirection === 'asc' ? 'arrow-upward' : 'arrow-downward') : 'filter-list'}
              size={14}
              color={sortColumn === 'size' ? '#4fc3f7' : '#858585'}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.headerCellWrapper}>
          <Text style={[styles.headerCell, styles.timeCell]}>Timestamp</Text>
          <TouchableOpacity onPress={() => handleSort('enqueuedTime')}>
            <MaterialIcons
              name={sortColumn === 'enqueuedTime' ? (sortDirection === 'asc' ? 'arrow-upward' : 'arrow-downward') : 'filter-list'}
              size={14}
              color={sortColumn === 'enqueuedTime' ? '#4fc3f7' : '#858585'}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.headerCellWrapper}>
          <Text style={[styles.headerCell, styles.deliveryCell]}>Redelivered</Text>
          <TouchableOpacity onPress={() => handleSort('deliveryCount')}>
            <MaterialIcons
              name={sortColumn === 'deliveryCount' ? (sortDirection === 'asc' ? 'arrow-upward' : 'arrow-downward') : 'filter-list'}
              size={14}
              color={sortColumn === 'deliveryCount' ? '#4fc3f7' : '#858585'}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.headerCellWrapper}>
          <Text style={[styles.headerCell, styles.amountCell]}>Properties</Text>
          <TouchableOpacity onPress={() => handleSort('properties')}>
            <MaterialIcons
              name={sortColumn === 'properties' ? (sortDirection === 'asc' ? 'arrow-upward' : 'arrow-downward') : 'filter-list'}
              size={14}
              color={sortColumn === 'properties' ? '#4fc3f7' : '#858585'}
            />
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView style={styles.messageList}>
        {loading && (
          <View style={styles.statusContainer}>
            <Text style={styles.statusText}>Loading messages...</Text>
          </View>
        )}
        {error && (
          <View style={styles.statusContainer}>
            <Text style={styles.errorText}>Error: {error}</Text>
          </View>
        )}
        {!loading && !error && messages.length === 0 && selectedQueue && (
          <View style={styles.statusContainer}>
            <Text style={styles.statusText}>No messages in queue</Text>
          </View>
        )}
        {!loading && !error && messages.length === 0 && !selectedQueue && (
          <View style={styles.statusContainer}>
            <Text style={styles.statusText}>Select a queue to view messages</Text>
          </View>
        )}
        {!loading && !error && messages.length > 0 && filteredAndSortedMessages.length === 0 && (
          <View style={styles.statusContainer}>
            <Text style={styles.statusText}>No messages match your search</Text>
          </View>
        )}
        {!loading && !error && filteredAndSortedMessages.map((message) => (
          <View
            key={message.id}
            // @ts-ignore - web only props
            onContextMenu={(e) => handleContextMenu(e, message)}
          >
            <TouchableOpacity
              style={[
                styles.messageRow,
                selectedMessage?.id === message.id && styles.selectedRow,
                selectedMessages.has(message.id) && styles.multiSelectedRow,
                clipboard?.cut && clipboard.message.id === message.id && styles.cutRow,
              ]}
              onPress={(e) => handleMessageClick(message, e.nativeEvent)}
            >
              {selectedMessages.has(message.id) && (
                <View style={styles.checkboxContainer}>
                  <MaterialIcons name="check-box" size={18} color="#4fc3f7" />
                </View>
              )}
              <Text style={[styles.cell, styles.sequenceCell]}>
                {message.sequenceNumber}
              </Text>
              <Text style={[styles.cell, styles.labelCell]} numberOfLines={1}>
                {message.label}
              </Text>
              <Text style={[styles.cell, styles.sizeCell]}>{message.size}</Text>
              <Text style={[styles.cell, styles.timeCell]}>{message.enqueuedTime}</Text>
              <Text style={[styles.cell, styles.deliveryCell]}>
                {message.deliveryCount > 0 ? 'Yes' : 'No'}
              </Text>
              <Text style={[styles.cell, styles.amountCell]} numberOfLines={1}>
                {Object.keys(message.body || {}).slice(0, 3).join(', ')}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      <ContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        items={contextMenuItems}
        onClose={() => setContextMenu({ ...contextMenu, visible: false })}
      />

      <EditMessageModal
        visible={showEditModal}
        message={editingMessage}
        queueName={selectedQueue?.queueName}
        onClose={() => {
          setShowEditModal(false);
          setEditingMessage(null);
        }}
        onSave={handleSaveEdit}
      />

      {selectedQueue && (
        <MoveMessageModal
          visible={showMoveModal}
          onClose={() => {
            setShowMoveModal(false);
            setMovingMessageIds([]);
          }}
          onMove={handleMoveMessages}
          connectionId={selectedQueue.connectionId}
          sourceQueue={selectedQueue.queueName}
          messageCount={movingMessageIds.length}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    borderBottomWidth: 1,
    borderBottomColor: '#3e3e42',
  },
  queueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#252526',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#3e3e42',
  },
  queueName: {
    color: '#cccccc',
    fontSize: 14,
    fontWeight: '600',
  },
  queueHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#0e639c',
  },
  importButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
  },
  searchInput: {
    backgroundColor: '#3e3e42',
    color: '#cccccc',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    fontSize: 12,
    minWidth: 200,
  },
  messageCount: {
    color: '#858585',
    fontSize: 12,
    minWidth: 80,
    textAlign: 'right',
  },
  header: {
    flexDirection: 'row',
    backgroundColor: '#2d2d30',
    borderBottomWidth: 1,
    borderBottomColor: '#3e3e42',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  headerCellWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerCell: {
    color: '#cccccc',
    fontSize: 13,
    fontWeight: '600',
  },
  messageList: {
    flex: 1,
  },
  messageRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d30',
  },
  selectedRow: {
    backgroundColor: '#094771',
  },
  multiSelectedRow: {
    backgroundColor: '#0a3a52',
  },
  cutRow: {
    opacity: 0.5,
    backgroundColor: '#3e2e1f',
  },
  checkboxContainer: {
    justifyContent: 'center',
    marginRight: 8,
  },
  bulkToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e4e6b',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a5f7e',
  },
  bulkToolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bulkToolbarText: {
    color: '#cccccc',
    fontSize: 13,
    fontWeight: '600',
  },
  bulkToolbarActions: {
    flexDirection: 'row',
    gap: 8,
  },
  bulkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#2a5f7e',
  },
  bulkButtonText: {
    color: '#cccccc',
    fontSize: 12,
  },
  bulkButtonDanger: {
    color: '#f48771',
  },
  cell: {
    color: '#cccccc',
    fontSize: 13,
  },
  sequenceCell: {
    width: 100,
  },
  labelCell: {
    width: 120,
  },
  sizeCell: {
    width: 80,
  },
  timeCell: {
    width: 180,
  },
  deliveryCell: {
    width: 120,
  },
  amountCell: {
    flex: 1,
    textAlign: 'right',
  },
  statusContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    color: '#858585',
    fontSize: 13,
  },
  errorText: {
    color: '#f48771',
    fontSize: 13,
  },
});
