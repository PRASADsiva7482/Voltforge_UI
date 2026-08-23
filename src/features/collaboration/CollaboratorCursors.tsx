import { Group, Circle, Text } from 'react-konva';
import type { CollaboratorInfo } from '../../hooks/useCollaboration';

interface Props {
  collaborators: Record<string, CollaboratorInfo>;
  isDark: boolean;
}

export default function CollaboratorCursors({ collaborators, isDark }: Props) {
  return (
    <>
      {Object.values(collaborators).map((user) => (
        <Group
          key={user.userId || user.displayName || 'unknown'}
          x={Number(user.x || 0)}
          y={Number(user.y || 0)}
        >
          {/* Glowing Cursor Dot */}
          <Circle
            radius={5}
            fill={user.color || '#38bdf8'}
            shadowColor={user.color || '#38bdf8'}
            shadowBlur={8}
          />
          {/* Inner Dot Core */}
          <Circle radius={2} fill="#ffffff" />
          {/* User Name Badge */}
          <Text
            text={user.displayName || 'Collaborator'}
            x={10}
            y={-12}
            fontSize={10}
            fontStyle="bold"
            fill={isDark ? '#e2e8f0' : '#0f172a'}
            fontFamily="'Inter', sans-serif"
          />
        </Group>
      ))}
    </>
  );
}
