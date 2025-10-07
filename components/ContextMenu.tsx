import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Modal } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export interface ContextMenuItem {
  label: string;
  icon?: string;
  iconColor?: string;
  onPress: () => void;
  separator?: boolean;
  danger?: boolean;
}

interface ContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ visible, x, y, items, onClose }: ContextMenuProps) {
  useEffect(() => {
    if (visible) {
      const handleClickOutside = () => onClose();
      const timer = setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 100);

      return () => {
        clearTimeout(timer);
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.menu, { left: x, top: y }]}>
          {items.map((item, index) => (
            <React.Fragment key={index}>
              {item.separator && <View style={styles.separator} />}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  item.onPress();
                  onClose();
                }}
              >
                {item.icon && (
                  <MaterialIcons
                    name={item.icon as any}
                    size={16}
                    color={item.danger ? '#f48771' : item.iconColor || '#cccccc'}
                    style={styles.menuIcon}
                  />
                )}
                <Text style={[styles.menuText, item.danger && styles.dangerText]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  menu: {
    position: 'absolute',
    backgroundColor: '#2d2d30',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#454545',
    minWidth: 180,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 8,
  },
  menuIcon: {
    width: 16,
  },
  menuText: {
    color: '#cccccc',
    fontSize: 13,
  },
  dangerText: {
    color: '#f48771',
  },
  separator: {
    height: 1,
    backgroundColor: '#454545',
    marginVertical: 4,
  },
});
