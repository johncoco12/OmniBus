import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import HexView from './HexView';
import XMLView from './XMLView';
import DotNetView from './DotNetView';
import WCFView from './WCFView';
import JSONView from './JSONView';

type FormatTab = 'Text' | 'Hex' | 'XML' | '.Net' | 'WCF' | 'JSON';

interface MessageViewerProps {
  message: any;
}

export default function MessageViewer({ message }: MessageViewerProps) {
  const [activeTab, setActiveTab] = useState<FormatTab>('JSON');
  const [activeFooterTab, setActiveFooterTab] = useState<'body' | 'metadata'>('body');

  const formatMessageBody = (body: any, format: FormatTab): string => {
    if (!body) return '';

    switch (format) {
      case 'JSON':
        return JSON.stringify(body, null, 2);
      case 'Text':
        return JSON.stringify(body);
      default:
        return JSON.stringify(body, null, 2);
    }
  };

  const tabs: FormatTab[] = ['Text', 'Hex', 'XML', '.Net', 'WCF', 'JSON'];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Message Body (read-only)</Text>
      </View>

      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'Hex' && message ? (
        <HexView data={JSON.stringify(message.body)} />
      ) : activeTab === 'XML' && message ? (
        <XMLView data={message.body} />
      ) : activeTab === '.Net' && message ? (
        <DotNetView data={message.body} />
      ) : activeTab === 'WCF' && message ? (
        <WCFView data={message.body} />
      ) : activeTab === 'JSON' && message ? (
        <JSONView data={message.body} />
      ) : (
        <ScrollView style={styles.content}>
          <Text style={styles.codeText}>
            {message ? formatMessageBody(message.body, activeTab) : 'Select a message to view its content'}
          </Text>
        </ScrollView>
      )}

      {message && (
        <View style={styles.footer}>
          <View style={styles.footerTabs}>
            <TouchableOpacity
              style={[styles.footerTab, activeFooterTab === 'body' && styles.activeFooterTab]}
              onPress={() => setActiveFooterTab('body')}
            >
              <Text style={styles.footerTabText}>Message Body</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerTab, activeFooterTab === 'metadata' && styles.activeFooterTab]}
              onPress={() => setActiveFooterTab('metadata')}
            >
              <Text style={styles.footerTabText}>Metadata</Text>
            </TouchableOpacity>
          </View>
          {activeFooterTab === 'metadata' ? (
            <ScrollView style={styles.metadataContainer}>
              <View style={styles.metadataContent}>
                <Text style={styles.metadataSection}>Message Properties</Text>
                <View style={styles.metadataTable}>
                  <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>Message ID:</Text>
                    <Text style={styles.metadataValue}>{message.id || 'N/A'}</Text>
                  </View>
                  <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>Queue:</Text>
                    <Text style={styles.metadataValue}>{message.queue || 'N/A'}</Text>
                  </View>
                  <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>Timestamp:</Text>
                    <Text style={styles.metadataValue}>
                      {message.timestamp ? new Date(message.timestamp).toLocaleString() : 'N/A'}
                    </Text>
                  </View>
                  <View style={styles.metadataRow}>
                    <Text style={styles.metadataKey}>Redelivered:</Text>
                    <Text style={styles.metadataValue}>{message.redelivered ? 'Yes' : 'No'}</Text>
                  </View>
                </View>

                {message.properties?.headers && Object.keys(message.properties.headers).length > 0 && (
                  <>
                    <Text style={styles.metadataSection}>Headers</Text>
                    <View style={styles.metadataTable}>
                      {Object.entries(message.properties.headers).map(([key, value]) => (
                        <View key={key} style={styles.metadataRow}>
                          <Text style={styles.metadataKey}>{key}:</Text>
                          <Text style={styles.metadataValue}>{String(value)}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {message.properties && (
                  <>
                    <Text style={styles.metadataSection}>Additional Properties</Text>
                    <View style={styles.metadataTable}>
                      {Object.entries(message.properties)
                        .filter(([key]) => key !== 'headers')
                        .map(([key, value]) => (
                          <View key={key} style={styles.metadataRow}>
                            <Text style={styles.metadataKey}>{key}:</Text>
                            <Text style={styles.metadataValue}>
                              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                            </Text>
                          </View>
                        ))}
                    </View>
                  </>
                )}
              </View>
            </ScrollView>
          ) : (
            <Text style={styles.footerInfo}>
              Messages loaded on: {new Date().toLocaleString()}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    minHeight: 300,
  },
  header: {
    backgroundColor: '#2d2d30',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#3e3e42',
  },
  title: {
    color: '#cccccc',
    fontSize: 13,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#2d2d30',
    borderBottomWidth: 1,
    borderBottomColor: '#3e3e42',
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#007acc',
  },
  tabText: {
    color: '#858585',
    fontSize: 13,
  },
  activeTabText: {
    color: '#cccccc',
  },
  content: {
    flex: 1,
    padding: 12,
  },
  codeText: {
    color: '#d4d4d4',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  footer: {
    backgroundColor: '#2d2d30',
    borderTopWidth: 1,
    borderTopColor: '#3e3e42',
  },
  footerTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#3e3e42',
  },
  footerTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeFooterTab: {
    borderBottomColor: '#007acc',
  },
  footerTabText: {
    color: '#cccccc',
    fontSize: 12,
  },
  footerInfo: {
    color: '#858585',
    fontSize: 11,
    padding: 6,
  },
  metadataContainer: {
    maxHeight: 200,
    backgroundColor: '#1e1e1e',
  },
  metadataContent: {
    padding: 12,
  },
  metadataSection: {
    color: '#4ec9b0',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
  },
  metadataTable: {
    backgroundColor: '#2d2d30',
    borderRadius: 4,
    padding: 8,
  },
  metadataRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#3e3e42',
  },
  metadataKey: {
    color: '#9cdcfe',
    fontSize: 12,
    fontFamily: 'monospace',
    minWidth: 150,
    fontWeight: '500',
  },
  metadataValue: {
    color: '#d4d4d4',
    fontSize: 12,
    fontFamily: 'monospace',
    flex: 1,
  },
});
