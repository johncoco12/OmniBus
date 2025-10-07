import React from 'react';
import { StyleSheet, View, Text, ScrollView } from 'react-native';

interface WCFViewProps {
  data: any;
}

interface Token {
  type: 'tag' | 'attribute' | 'value' | 'text' | 'namespace' | 'declaration';
  content: string;
}

export default function WCFView({ data }: WCFViewProps) {
  const jsonToWCF = (obj: any, rootName: string = 'Message', indent: number = 0): string => {
    const indentStr = '  '.repeat(indent);

    if (obj === null || obj === undefined) {
      return `${indentStr}<${rootName} i:nil="true" xmlns:i="http://www.w3.org/2001/XMLSchema-instance" />`;
    }

    if (typeof obj !== 'object') {
      const escaped = String(obj)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
      return `${indentStr}<${rootName}>${escaped}</${rootName}>`;
    }

    if (Array.isArray(obj)) {
      let xml = `${indentStr}<${rootName} xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">`;
      if (obj.length === 0) {
        xml += `</${rootName}>`;
        return xml;
      }
      xml += '\n';
      obj.forEach(item => {
        xml += jsonToWCF(item, 'a:anyType', indent + 1) + '\n';
      });
      xml += `${indentStr}</${rootName}>`;
      return xml;
    }

    // Object
    const entries = Object.entries(obj);
    if (entries.length === 0) {
      return `${indentStr}<${rootName} />`;
    }

    let xml = `${indentStr}<${rootName} xmlns:i="http://www.w3.org/2001/XMLSchema-instance">`;
    xml += '\n';

    entries.forEach(([key, value]) => {
      xml += jsonToWCF(value, key, indent + 1) + '\n';
    });

    xml += `${indentStr}</${rootName}>`;
    return xml;
  };

  const tokenizeXML = (xml: string): Token[] => {
    const tokens: Token[] = [];
    const regex = /(<!--[\s\S]*?-->)|(<\?[\s\S]*?\?>)|(<\/?)(\w+:?\w*)([^>]*?)(\/?>)|([^<]+)/g;
    let match;

    while ((match = regex.exec(xml)) !== null) {
      if (match[1]) {
        // Comment
        tokens.push({ type: 'text', content: match[1] });
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

        // Check if it's a namespaced tag
        if (tagName.includes(':')) {
          const [ns, name] = tagName.split(':');
          tokens.push({ type: 'namespace', content: ns + ':' });
          tokens.push({ type: 'tag', content: name });
        } else {
          tokens.push({ type: 'tag', content: tagName });
        }

        if (attributes.trim()) {
          // Parse attributes
          const attrRegex = /(\w+:?\w*)="([^"]*)"/g;
          let attrMatch;
          while ((attrMatch = attrRegex.exec(attributes)) !== null) {
            tokens.push({ type: 'text', content: ' ' });
            const attrName = attrMatch[1];
            if (attrName.includes(':')) {
              const [ns, name] = attrName.split(':');
              tokens.push({ type: 'namespace', content: ns + ':' });
              tokens.push({ type: 'attribute', content: name });
            } else {
              tokens.push({ type: 'attribute', content: attrName });
            }
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
      case 'namespace':
        return '#4ec9b0'; // Teal for namespaces
      case 'declaration':
        return '#c586c0'; // Purple for declarations
      case 'text':
      default:
        return '#d4d4d4'; // Default text color
    }
  };

  let wcfContent: string;
  try {
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        wcfContent = '<?xml version="1.0" encoding="utf-8"?>\n';
        wcfContent += '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">\n';
        wcfContent += '  <s:Body>\n';
        wcfContent += jsonToWCF(parsed, 'MessageContract', 2).split('\n').map(line => '    ' + line).join('\n') + '\n';
        wcfContent += '  </s:Body>\n';
        wcfContent += '</s:Envelope>';
      } catch {
        wcfContent = '<?xml version="1.0" encoding="utf-8"?>\n';
        wcfContent += '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">\n';
        wcfContent += '  <s:Body>\n';
        wcfContent += `    <Message>${data}</Message>\n`;
        wcfContent += '  </s:Body>\n';
        wcfContent += '</s:Envelope>';
      }
    } else {
      wcfContent = '<?xml version="1.0" encoding="utf-8"?>\n';
      wcfContent += '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">\n';
      wcfContent += '  <s:Body>\n';
      wcfContent += jsonToWCF(data, 'MessageContract', 2).split('\n').map(line => '    ' + line).join('\n') + '\n';
      wcfContent += '  </s:Body>\n';
      wcfContent += '</s:Envelope>';
    }
  } catch (error) {
    wcfContent = '<?xml version="1.0"?>\n<!-- Error converting to WCF format -->';
  }

  const tokens = tokenizeXML(wcfContent);

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
