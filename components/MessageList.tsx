import React, { useEffect, useState, useMemo } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { serviceBusManager } from '../sources/services/shared';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import EditMessageModal from './EditMessageModal';

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

  useEffect(() => {
    if (!selectedQueue) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
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

    fetchMessages();
  }, [selectedQueue, refreshTrigger]);

  // Keyboard shortcuts for Copy/Cut/Paste
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedMessage, clipboard]);

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
        window.location.reload();
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
        window.location.reload();
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

  const handleMoveMessage = async (targetQueue: string) => {
    if (!contextMenu.message || !selectedQueue) return;

    try {
      const service = serviceBusManager.getService(selectedQueue.connectionId);
      if (!service) {
        throw new Error('Service not found');
      }

      await service.moveMessage(selectedQueue.queueName, targetQueue, contextMenu.message.id);

      // Refresh messages
      setMessages(prev => prev.filter(m => m.id !== contextMenu.message?.id));

      console.log(`✓ Message moved to ${targetQueue}`);
    } catch (error) {
      console.error('Failed to move message:', error);
      alert(`Failed to move message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const contextMenuItems: ContextMenuItem[] = [
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
        const target = prompt('Enter target queue name:');
        if (target) {
          handleMoveMessage(target);
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
                clipboard?.cut && clipboard.message.id === message.id && styles.cutRow,
              ]}
              onPress={() => onSelectMessage(message)}
            >
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
  cutRow: {
    opacity: 0.5,
    backgroundColor: '#3e2e1f',
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
