import React from 'react';
import { StyleSheet, View, Text, ScrollView } from 'react-native';

interface DotNetViewProps {
  data: any;
}

interface Token {
  type: 'keyword' | 'type' | 'property' | 'value' | 'string' | 'number' | 'boolean' | 'null' | 'bracket' | 'text';
  content: string;
}

export default function DotNetView({ data }: DotNetViewProps) {
  const jsonToDotNet = (obj: any, indent: number = 0): Token[] => {
    const tokens: Token[] = [];
    const indentStr = '  '.repeat(indent);

    if (obj === null || obj === undefined) {
      tokens.push({ type: 'null', content: 'null' });
      return tokens;
    }

    if (typeof obj === 'string') {
      tokens.push({ type: 'string', content: `"${obj}"` });
      return tokens;
    }

    if (typeof obj === 'number') {
      tokens.push({ type: 'number', content: String(obj) });
      return tokens;
    }

    if (typeof obj === 'boolean') {
      tokens.push({ type: 'boolean', content: String(obj) });
      return tokens;
    }

    if (Array.isArray(obj)) {
      tokens.push({ type: 'keyword', content: 'new' }, { type: 'text', content: ' ' });
      tokens.push({ type: 'type', content: 'List<object>' });
      tokens.push({ type: 'text', content: '\n' + indentStr });
      tokens.push({ type: 'bracket', content: '{' }, { type: 'text', content: '\n' });

      obj.forEach((item, index) => {
        tokens.push({ type: 'text', content: indentStr + '  ' });
        tokens.push(...jsonToDotNet(item, indent + 1));
        if (index < obj.length - 1) {
          tokens.push({ type: 'text', content: ',' });
        }
        tokens.push({ type: 'text', content: '\n' });
      });

      tokens.push({ type: 'text', content: indentStr });
      tokens.push({ type: 'bracket', content: '}' });
      return tokens;
    }

    // Object
    const className = 'AnonymousType';
    tokens.push({ type: 'keyword', content: 'new' }, { type: 'text', content: ' ' });
    tokens.push({ type: 'type', content: className });
    tokens.push({ type: 'text', content: '\n' + indentStr });
    tokens.push({ type: 'bracket', content: '{' }, { type: 'text', content: '\n' });

    const entries = Object.entries(obj);
    entries.forEach(([key, value], index) => {
      tokens.push({ type: 'text', content: indentStr + '  ' });
      tokens.push({ type: 'property', content: key });
      tokens.push({ type: 'text', content: ' = ' });
      tokens.push(...jsonToDotNet(value, indent + 1));
      if (index < entries.length - 1) {
        tokens.push({ type: 'text', content: ',' });
      }
      tokens.push({ type: 'text', content: '\n' });
    });

    tokens.push({ type: 'text', content: indentStr });
    tokens.push({ type: 'bracket', content: '}' });

    return tokens;
  };

  const getColorForTokenType = (type: string): string => {
    switch (type) {
      case 'keyword':
        return '#569cd6'; // Blue for keywords (new, var, etc.)
      case 'type':
        return '#4ec9b0'; // Teal for types
      case 'property':
        return '#9cdcfe'; // Light blue for properties
      case 'string':
        return '#ce9178'; // Orange for strings
      case 'number':
        return '#b5cea8'; // Light green for numbers
      case 'boolean':
        return '#569cd6'; // Blue for boolean
      case 'null':
        return '#569cd6'; // Blue for null
      case 'bracket':
        return '#ffd700'; // Gold for brackets
      case 'value':
        return '#d4d4d4'; // Default
      case 'text':
      default:
        return '#d4d4d4'; // Default text color
    }
  };

  let tokens: Token[];
  try {
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        tokens = [
          { type: 'keyword', content: 'var' },
          { type: 'text', content: ' message = ' },
          ...jsonToDotNet(parsed),
          { type: 'text', content: ';' }
        ];
      } catch {
        tokens = [
          { type: 'keyword', content: 'var' },
          { type: 'text', content: ' message = ' },
          { type: 'string', content: `"${data}"` },
          { type: 'text', content: ';' }
        ];
      }
    } else {
      tokens = [
        { type: 'keyword', content: 'var' },
        { type: 'text', content: ' message = ' },
        ...jsonToDotNet(data),
        { type: 'text', content: ';' }
      ];
    }
  } catch (error) {
    tokens = [
      { type: 'text', content: '// Error converting to .NET format' }
    ];
  }

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
