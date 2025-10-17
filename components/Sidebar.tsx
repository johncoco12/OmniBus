import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { connectionRepo, serviceBusManager } from '../sources/services/shared';
import AddServerModal from './AddServerModal';
import ContextMenu, { ContextMenuItem } from './ContextMenu';

interface TreeNode {
  id: string;
  label: string;
  iconType: 'folder' | 'queue' | 'topic' | 'server';
  children?: TreeNode[];
  count?: number;
  connectionId?: string;
  queueName?: string;
  serviceType?: 'rabbitmq' | 'azure-service-bus' | 'msmq' | 'activemq';
}

const mockData: TreeNode[] = [
  {
    id: 'azure-prod',
    label: 'Azure Service Bus Production',
    iconType: 'server',
    children: [
      {
        id: 'cogin-test',
        label: 'cogin-test-ns (Azure SB - Standard)',
        iconType: 'server',
        children: [
          {
            id: 'queues',
            label: 'Queues',
            iconType: 'folder',
            children: [
              { id: 'billing', label: 'billing', iconType: 'queue', count: 3 },
              { id: 'deadletter', label: 'deadletter', iconType: 'queue', count: 1 },
              { id: 'incoming', label: 'incoming_orders', iconType: 'queue', count: 6 },
              { id: 'invoices', label: 'invoices', iconType: 'queue', count: 4 },
            ],
          },
          { id: 'topics', label: 'Topics', iconType: 'folder' },
        ],
      },
    ],
  },
  // { id: 'rabbitmq', label: 'RabbitMQ', iconType: 'folder' },
  // { id: 'msmq', label: 'MSMQ', iconType: 'folder' },
  // { id: 'activemq', label: 'ActiveMQ', iconType: 'folder' },
];

interface SidebarProps {
  onQueueSelect?: (queue: { connectionId: string; queueName: string } | null) => void;
}

export default function Sidebar({ onQueueSelect }: SidebarProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [servers, setServers] = useState<TreeNode[]>([]);
  const [searchText, setSearchText] = useState('');
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; node: TreeNode | null }>({
    visible: false,
    x: 0,
    y: 0,
    node: null,
  });

  // Load saved connections on mount
  useEffect(() => {
    loadSavedConnections();
  }, []);

  // Auto-refresh queue counts every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refreshQueueCounts();
    }, 5000);

    return () => clearInterval(interval);
  }, [servers]);

  const refreshQueueCounts = async () => {
    if (servers.length === 0) return;

    try {
      const updatedServers = await Promise.all(
        servers.map(async (server) => {
          try {
            const service = serviceBusManager.getService(server.id);
            if (!service) return server;

            const queues = await service.getQueues();

            // Update queue counts
            const updatedChildren = server.children?.map(child => {
              if (child.iconType === 'folder' && child.children) {
                const updatedQueueNodes = child.children.map(queueNode => {
                  const updatedQueue = queues.find(q => q.name === queueNode.queueName);
                  if (updatedQueue) {
                    return { ...queueNode, count: updatedQueue.messageCount };
                  }
                  return queueNode;
                });
                return { ...child, children: updatedQueueNodes };
              }
              return child;
            });

            return { ...server, children: updatedChildren };
          } catch (error) {
            // Silently fail for individual servers
            return server;
          }
        })
      );

      setServers(updatedServers);
    } catch (error) {
      console.error('Failed to refresh queue counts:', error);
    }
  };

  const loadSavedConnections = async () => {
    try {
      const savedConnections = await connectionRepo.getAllConnections();
      console.log('Loading saved connections:', savedConnections);

      const serverNodes: TreeNode[] = [];

      for (const conn of savedConnections) {
        try {
          // Try to connect
          await serviceBusManager.addConnection(conn);

          // Fetch queues and topics
          const service = serviceBusManager.getService(conn.id);
          let queueNodes: TreeNode[] = [];
          let topicNodes: TreeNode[] = [];

          if (service) {
            // Get queues
            const queues = await service.getQueues();
            console.log(`Queues for ${conn.name}:`, queues);

            queueNodes = queues.map(q => ({
              id: `${conn.id}-queue-${q.id}`,
              label: q.name,
              iconType: 'queue' as const,
              count: q.messageCount,
              connectionId: conn.id,
              queueName: q.name,
            }));

            // Get topics (if supported - Azure Service Bus)
            if (service.getTopics) {
              try {
                const topics = await service.getTopics();
                console.log(`Topics for ${conn.name}:`, topics);

                topicNodes = topics.map(t => ({
                  id: `${conn.id}-topic-${t.id}`,
                  label: t.name,
                  iconType: 'topic' as const,
                  count: t.subscriptionCount,
                  connectionId: conn.id,
                  children: [], // Subscriptions will be loaded on demand
                }));
              } catch (error) {
                console.warn('Failed to load topics:', error);
              }
            }
          }

          const children: TreeNode[] = [];
          if (queueNodes.length > 0) {
            children.push({
              id: `${conn.id}-queues`,
              label: 'Queues',
              iconType: 'folder',
              children: queueNodes,
            });
          }
          if (topicNodes.length > 0) {
            children.push({
              id: `${conn.id}-topics`,
              label: 'Topics',
              iconType: 'folder',
              children: topicNodes,
            });
          }

          const serverNode: TreeNode = {
            id: conn.id,
            label: conn.name,
            iconType: 'server',
            serviceType: conn.type,
            children: children,
          };

          serverNodes.push(serverNode);

          // Auto-expand this server
          setExpandedNodes(prev => new Set([...prev, conn.id, `${conn.id}-queues`]));
        } catch (error) {
          console.error(`Failed to connect to ${conn.name}:`, error);
          // Still add the server to the list, just without queues
          serverNodes.push({
            id: conn.id,
            label: `${conn.name} (disconnected)`,
            iconType: 'server',
            serviceType: conn.type,
            children: [],
          });
        }
      }

      setServers(serverNodes);
    } catch (error) {
      console.error('Failed to load saved connections:', error);
    }
  };

  const handleAddServer = async (connection: {
    name: string;
    type: 'rabbitmq' | 'azure-service-bus' | 'msmq' | 'activemq';
    connectionString: string;
  }) => {
    try {

      const newConnection = {
        id: `${connection.type}-${Date.now()}`,
        name: connection.name,
        type: connection.type,
        connectionString: connection.connectionString,
        isConnected: false,
      };

      console.log('Attempting to add connection:', newConnection);

      // Save to storage
      await connectionRepo.saveConnection(newConnection);

      // Try to connect
      let queues: any[] = [];
      try {
        await serviceBusManager.addConnection(newConnection);
        newConnection.isConnected = true;
        await connectionRepo.updateConnection(newConnection.id, { isConnected: true });

        // Fetch queues
        const service = serviceBusManager.getService(newConnection.id);
        if (service) {
          queues = await service.getQueues();
          console.log('Fetched queues:', queues);
        }
      } catch (error: any) {
        console.error('Failed to connect to server:', error);
        alert(`Connection failed: ${error?.message || 'Unknown error'}\n\nCheck console for details.`);
      }

      // Add to UI with queues
      const queueNodes: TreeNode[] = queues.map(q => ({
        id: `${newConnection.id}-queue-${q.id}`,
        label: q.name,
        iconType: 'queue' as const,
        count: q.messageCount,
        connectionId: newConnection.id,
        queueName: q.name,
      }));

      const newServerNode: TreeNode = {
        id: newConnection.id,
        label: newConnection.name,
        iconType: 'server',
        serviceType: newConnection.type,
        children: queueNodes.length > 0 ? [
          {
            id: `${newConnection.id}-queues`,
            label: 'Queues',
            iconType: 'folder',
            children: queueNodes,
          }
        ] : [],
      };

      // Reload all connections to ensure clean state
      await loadSavedConnections();
      setShowAddModal(false);

      // Auto-expand the new server
      setExpandedNodes(prev => new Set([...prev, newConnection.id, `${newConnection.id}-queues`]));
    } catch (error: any) {
      console.error('Error adding server:', error);
      alert(`Failed to add server: ${error?.message || 'Unknown error'}`);
    }
  };

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const handleContextMenu = (event: any, node: TreeNode) => {
    // Only show context menu for server nodes
    if (node.iconType === 'server') {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({
        visible: true,
        x: event.clientX,
        y: event.clientY,
        node,
      });
    }
  };

  const handleEditConnection = () => {
    if (contextMenu.node) {
      setShowEditModal(true);
    }
  };

  const handleDeleteConnection = async () => {
    if (!contextMenu.node) return;

    if (confirm(`Are you sure you want to delete the connection "${contextMenu.node.label}"?`)) {
      try {
        // Remove from service manager
        await serviceBusManager.removeConnection(contextMenu.node.id);

        // Remove from storage
        await connectionRepo.deleteConnection(contextMenu.node.id);

        // Remove from UI
        setServers(prev => prev.filter(s => s.id !== contextMenu.node?.id));

        console.log(`Connection ${contextMenu.node.id} deleted`);
      } catch (error) {
        console.error('Failed to delete connection:', error);
        alert(`Failed to delete connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  const handleRefreshConnection = async () => {
    if (!contextMenu.node) return;

    try {
      const service = serviceBusManager.getService(contextMenu.node.id);
      if (service) {
        const queues = await service.getQueues();

        // Update server's queues in the state
        setServers(prev => prev.map(server => {
          if (server.id === contextMenu.node?.id) {
            const queueNodes: TreeNode[] = queues.map(q => ({
              id: `${server.id}-queue-${q.id}`,
              label: q.name,
              iconType: 'queue' as const,
              count: q.messageCount,
              connectionId: server.id,
              queueName: q.name,
            }));

            return {
              ...server,
              children: queueNodes.length > 0 ? [
                {
                  id: `${server.id}-queues`,
                  label: 'Queues',
                  iconType: 'folder' as const,
                  children: queueNodes,
                }
              ] : [],
            };
          }
          return server;
        }));

        console.log(`Connection ${contextMenu.node.id} refreshed`);
      }
    } catch (error) {
      console.error('Failed to refresh connection:', error);
      alert(`Failed to refresh connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const serverContextMenuItems: ContextMenuItem[] = [
    {
      label: 'Refresh',
      icon: 'refresh',
      onPress: handleRefreshConnection,
    },
    {
      label: 'Edit Connection',
      icon: 'edit',
      onPress: handleEditConnection,
      separator: true,
    },
    {
      label: 'Delete Connection',
      icon: 'delete',
      onPress: handleDeleteConnection,
      danger: true,
    },
  ];

  const getIcon = (iconType: string, serviceType?: string) => {
    switch (iconType) {
      case 'server':
        return getServiceIcon(serviceType);
      case 'folder':
        return <MaterialIcons name="folder" size={16} color="#cccccc" />;
      case 'queue':
        return <MaterialCommunityIcons name="email-outline" size={16} color="#cccccc" />;
      case 'topic':
        return <MaterialIcons name="topic" size={16} color="#cccccc" />;
      default:
        return <MaterialIcons name="folder" size={16} color="#cccccc" />;
    }
  };

  const getServiceIcon = (serviceType?: string) => {
    switch (serviceType) {
      case 'rabbitmq':
        return <MaterialCommunityIcons name="rabbit" size={16} color="#FF6600" />;
      case 'azure-service-bus':
        return <MaterialCommunityIcons name="microsoft-azure" size={16} color="#0089D6" />;
      case 'msmq':
        return <MaterialCommunityIcons name="microsoft-windows" size={16} color="#00A4EF" />;
      case 'activemq':
        return <MaterialCommunityIcons name="message-processing" size={16} color="#D73A47" />;
      default:
        return <MaterialIcons name="dns" size={16} color="#cccccc" />;
    }
  };

  const filterTreeNode = (node: TreeNode, searchLower: string): TreeNode | null => {
    // If node label matches, include it with all children
    if (node.label.toLowerCase().includes(searchLower)) {
      return node;
    }

    // Check if any children match
    if (node.children) {
      const filteredChildren = node.children
        .map(child => filterTreeNode(child, searchLower))
        .filter((child): child is TreeNode => child !== null);

      if (filteredChildren.length > 0) {
        return { ...node, children: filteredChildren };
      }
    }

    return null;
  };

  const filteredServers = useMemo(() => {
    if (!searchText.trim()) {
      return servers;
    }

    const searchLower = searchText.toLowerCase();
    return servers
      .map(server => filterTreeNode(server, searchLower))
      .filter((server): server is TreeNode => server !== null);
  }, [servers, searchText]);

  // Auto-expand nodes when searching
  useEffect(() => {
    if (searchText.trim()) {
      const allNodeIds = new Set<string>();
      const collectNodeIds = (node: TreeNode) => {
        allNodeIds.add(node.id);
        if (node.children) {
          node.children.forEach(collectNodeIds);
        }
      };
      filteredServers.forEach(collectNodeIds);
      setExpandedNodes(allNodeIds);
    }
  }, [searchText, filteredServers]);

  const renderNode = (node: TreeNode, level: number = 0): React.ReactNode => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;

    const handleNodeClick = () => {
      if (node.iconType === 'queue' && node.connectionId && node.queueName && onQueueSelect) {
        onQueueSelect({ connectionId: node.connectionId, queueName: node.queueName });
      } else if (hasChildren) {
        toggleNode(node.id);
      }
    };

    return (
      <View
        key={node.id}
        // @ts-ignore - web only props
        onContextMenu={(e) => handleContextMenu(e, node)}
      >
        <TouchableOpacity
          style={[styles.nodeRow, { paddingLeft: 8 + level * 16 }]}
          onPress={handleNodeClick}
        >
          {hasChildren ? (
            <MaterialIcons
              name={isExpanded ? 'arrow-drop-down' : 'arrow-right'}
              size={16}
              color="#cccccc"
              style={styles.expandIcon}
            />
          ) : (
            <View style={styles.expandIcon} />
          )}
          {getIcon(node.iconType, node.serviceType)}
          <Text style={styles.nodeLabel}>{node.label}</Text>
          {node.count !== undefined && (
            <Text style={styles.count}>({node.count})</Text>
          )}
        </TouchableOpacity>
        {isExpanded && hasChildren && (
          <View>
            {node.children!.map((child) => renderNode(child, level + 1))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Servers</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowAddModal(true)}
          >
            <MaterialIcons name="add" size={16} color="#cccccc" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton}>
            <MaterialIcons name="remove" size={16} color="#cccccc" />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={16} color="#858585" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search queues..."
          placeholderTextColor="#858585"
          value={searchText}
          onChangeText={setSearchText}
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText('')} style={styles.clearButton}>
            <MaterialIcons name="close" size={14} color="#858585" />
          </TouchableOpacity>
        )}
      </View>
      <ScrollView style={styles.treeView}>
        {filteredServers.length > 0 ? (
          filteredServers.map((node) => renderNode(node))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {searchText.trim() ? 'No queues found' : 'No servers connected'}
            </Text>
          </View>
        )}
      </ScrollView>

      <AddServerModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddServer}
      />

      <ContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        items={serverContextMenuItems}
        onClose={() => setContextMenu({ ...contextMenu, visible: false })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 280,
    backgroundColor: '#252526',
    borderRightWidth: 1,
    borderRightColor: '#3e3e42',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#2d2d30',
    borderBottomWidth: 1,
    borderBottomColor: '#3e3e42',
  },
  headerText: {
    color: '#cccccc',
    fontSize: 14,
    fontWeight: '600',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  headerButton: {
    padding: 4,
    borderRadius: 3,
    backgroundColor: '#3e3e42',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2d2d30',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#3e3e42',
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#3e3e42',
    color: '#cccccc',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    fontSize: 12,
  },
  clearButton: {
    padding: 4,
    marginLeft: 4,
  },
  emptyState: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: '#858585',
    fontSize: 12,
    textAlign: 'center',
  },
  treeView: {
    flex: 1,
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 6,
  },
  expandIcon: {
    width: 16,
    marginRight: 4,
  },
  nodeLabel: {
    color: '#cccccc',
    fontSize: 13,
    flex: 1,
  },
  count: {
    color: '#858585',
    fontSize: 12,
    marginRight: 8,
  },
});
