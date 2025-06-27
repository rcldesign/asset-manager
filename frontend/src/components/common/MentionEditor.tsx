'use client';

import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import {
  Box,
  Paper,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Typography,
} from '@mui/material';
import { Person as PersonIcon } from '@mui/icons-material';
import { useUsers } from '../../hooks/use-users';

interface MentionEditorProps {
  value: string;
  onChange: (value: string) => void;
  onMention?: (userId: string) => void;
  placeholder?: string;
}

interface MentionSuggestionProps {
  items: any[];
  command: any;
}

function MentionSuggestion({ items, command }: MentionSuggestionProps) {
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const selectItem = (index: number) => {
    const item = items[index];
    if (item) {
      command({ id: item.id, label: item.label });
    }
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((selectedIndex + items.length - 1) % items.length);
        return true;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((selectedIndex + 1) % items.length);
        return true;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        selectItem(selectedIndex);
        return true;
      }

      return false;
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [items, selectedIndex]);

  return (
    <Paper
      elevation={3}
      sx={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        mb: 1,
        maxHeight: 300,
        overflow: 'auto',
        minWidth: 200,
        zIndex: 1000,
      }}
    >
      <List dense>
        {items.map((item, index) => (
          <ListItem
            key={item.id}
            button
            selected={index === selectedIndex}
            onClick={() => selectItem(index)}
          >
            <ListItemAvatar>
              <Avatar sx={{ width: 32, height: 32 }}>
                {item.avatar || <PersonIcon />}
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary={item.label}
              secondary={item.email}
            />
          </ListItem>
        ))}
      </List>
    </Paper>
  );
}

export default function MentionEditor({ 
  value, 
  onChange, 
  onMention, 
  placeholder = 'Type @ to mention someone...' 
}: MentionEditorProps) {
  const { data: usersData } = useUsers();
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [suggestionItems, setSuggestionItems] = React.useState<any[]>([]);
  const [suggestionCommand, setSuggestionCommand] = React.useState<any>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Mention.configure({
        HTMLAttributes: {
          class: 'mention',
          style: 'color: #3B82F6; font-weight: 500; cursor: pointer;',
        },
        suggestion: {
          items: ({ query }: { query: string }) => {
            const users = usersData?.users || [];
            return users
              .filter(user => 
                user.fullName?.toLowerCase().includes(query.toLowerCase()) ||
                user.email.toLowerCase().includes(query.toLowerCase())
              )
              .slice(0, 5)
              .map(user => ({
                id: user.id,
                label: user.fullName || user.email,
                email: user.email,
                avatar: user.fullName?.[0] || user.email[0],
              }));
          },
          render: () => {
            return {
              onStart: (props: any) => {
                setSuggestionItems(props.items);
                setSuggestionCommand(props.command);
                setShowSuggestions(true);
              },
              onUpdate: (props: any) => {
                setSuggestionItems(props.items);
                setSuggestionCommand(props.command);
              },
              onExit: () => {
                setSuggestionItems([]);
                setSuggestionCommand(null);
                setShowSuggestions(false);
              },
            };
          },
        },
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);
      
      // Extract mentions
      const mentions = editor.getJSON().content?.flatMap((node: any) => 
        node.content?.filter((child: any) => child.type === 'mention')
          .map((mention: any) => mention.attrs.id) || []
      ) || [];
      
      mentions.forEach((userId: string) => {
        if (onMention) {
          onMention(userId);
        }
      });
    },
    editorProps: {
      attributes: {
        style: 'min-height: 100px; padding: 12px; outline: none;',
      },
    },
  });

  return (
    <Box sx={{ position: 'relative' }}>
      <Paper
        variant="outlined"
        sx={{
          p: 0,
          '&:focus-within': {
            borderColor: 'primary.main',
            borderWidth: 2,
          },
          '.ProseMirror': {
            minHeight: 100,
            p: 1.5,
            outline: 'none',
            '&:focus': {
              outline: 'none',
            },
          },
          '.ProseMirror p': {
            margin: 0,
          },
          '.ProseMirror-focused': {
            outline: 'none',
          },
        }}
      >
        <EditorContent editor={editor} />
        {!editor?.getText() && (
          <Typography
            sx={{
              position: 'absolute',
              top: 12,
              left: 12,
              color: 'text.secondary',
              pointerEvents: 'none',
            }}
          >
            {placeholder}
          </Typography>
        )}
      </Paper>
      
      {showSuggestions && suggestionItems.length > 0 && (
        <MentionSuggestion
          items={suggestionItems}
          command={suggestionCommand}
        />
      )}
    </Box>
  );
}