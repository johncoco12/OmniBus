import React from 'react';
import { StyleSheet, View, Text, ScrollView } from 'react-native';

interface XMLViewProps {
  data: any;
}

interface XMLToken {
  type: 'tag' | 'attribute' | 'value' | 'text' | 'comment' | 'declaration';
  content: string;
}

export default function XMLView({ data }: XMLViewProps) {
  const jsonToXML = (obj: any, rootName: string = 'root', indent: number = 0): string => {
    const indentStr = '  '.repeat(indent);

    if (obj === null || obj === undefined) {
      return `${indentStr}<${rootName} />`;
    }

    if (typeof obj !== 'object') {
      // Escape XML special characters
      const escaped = String(obj)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
      return `${indentStr}<${rootName}>${escaped}</${rootName}>`;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => jsonToXML(item, 'item', indent)).join('\n');
    }

    const entries = Object.entries(obj);
    if (entries.length === 0) {
      return `${indentStr}<${rootName} />`;
    }

    let xml = `${indentStr}<${rootName}>`;
    const hasComplexChildren = entries.some(([, value]) => typeof value === 'object' && value !== null);

    if (hasComplexChildren) {
      xml += '\n';
      entries.forEach(([key, value]) => {
        xml += jsonToXML(value, key, indent + 1) + '\n';
      });
      xml += indentStr;
    } else {
      entries.forEach(([key, value]) => {
        xml += `\n${jsonToXML(value, key, indent + 1)}`;
      });
      xml += '\n' + indentStr;
    }

    xml += `</${rootName}>`;
    return xml;
  };

  const tokenizeXML = (xml: string): XMLToken[] => {
    const tokens: XMLToken[] = [];
    const regex = /(<!--[\s\S]*?-->)|(<\?[\s\S]*?\?>)|(<\/?)(\w+)([^>]*?)(\/?>)|([^<]+)/g;
    let match;

    while ((match = regex.exec(xml)) !== null) {
      if (match[1]) {
        // Comment
        tokens.push({ type: 'comment', content: match[1] });
      } else if (match[2]) {
        // Declaration
        tokens.push({ type: 'declaration', content: match[2] });
      } else if (match[3] !== undefined) {
        // Tag
        const openClose = match[3];
        const tagName = match[4];
        const attributes = match[5];
        const endSlash = match[6];

        tokens.push({ type: 'tag', content: openClose });
        tokens.push({ type: 'tag', content: tagName });

        if (attributes.trim()) {
          // Parse attributes
          const attrRegex = /(\w+)="([^"]*)"/g;
          let attrMatch;
          while ((attrMatch = attrRegex.exec(attributes)) !== null) {
            tokens.push({ type: 'text', content: ' ' });
            tokens.push({ type: 'attribute', content: attrMatch[1] });
            tokens.push({ type: 'text', content: '="' });
            tokens.push({ type: 'value', content: attrMatch[2] });
            tokens.push({ type: 'text', content: '"' });
          }
        }

        tokens.push({ type: 'tag', content: endSlash });
      } else if (match[7]) {
        // Text content
        const text = match[7].trim();
        if (text) {
          tokens.push({ type: 'text', content: match[7] });
        } else if (match[7].includes('\n')) {
          tokens.push({ type: 'text', content: match[7] });
        }
      }
    }

    return tokens;
  };

  const getColorForTokenType = (type: string): string => {
    switch (type) {
      case 'tag':
        return '#569cd6'; // Blue for tags
      case 'attribute':
        return '#9cdcfe'; // Light blue for attributes
      case 'value':
        return '#ce9178'; // Orange for values
      case 'comment':
        return '#6a9955'; // Green for comments
      case 'declaration':
        return '#c586c0'; // Purple for declarations
      case 'text':
      default:
        return '#d4d4d4'; // Default text color
    }
  };

  let xmlContent: string;
  try {
    if (typeof data === 'string') {
      // If already a string, try to parse and re-format
      try {
        const parsed = JSON.parse(data);
        xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n' + jsonToXML(parsed);
      } catch {
        // If not JSON, assume it's already XML
        xmlContent = data;
      }
    } else {
      // Convert JSON object to XML
      xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n' + jsonToXML(data);
    }
  } catch (error) {
    xmlContent = '<?xml version="1.0"?>\n<!-- Error converting to XML -->';
  }

  const tokens = tokenizeXML(xmlContent);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.codeText}>
          {tokens.map((token, index) => (
            <Text
              key={index}
              style={{ color: getColorForTokenType(token.type) }}
            >
              {token.content}
            </Text>
          ))}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
  content: {
    padding: 12,
  },
  codeText: {
    fontSize: 13,
    fontFamily: 'monospace',
    lineHeight: 20,
  },
});
