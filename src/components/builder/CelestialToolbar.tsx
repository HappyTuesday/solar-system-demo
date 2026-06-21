import { memo } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useBuildStore } from '../../stores/buildStore';
import { BUILD_CELESTIAL_TEMPLATES } from '../../engine/buildData';
import type { CelestialBodyTemplate } from '../../types';
import './CelestialToolbar.css';

const DEFAULT_DOT_COLORS: Record<string, string> = {
  sun: '#ffdd00', mercury: '#cccccc', venus: '#ffcc88', earth: '#4488ff',
  mars: '#ff6644', jupiter: '#ffcc88', saturn: '#ffeecc',
  uranus: '#88ccff', neptune: '#4488ff', moon: '#cccccc',
  io: '#ffcc44', europa: '#ddccbb', ganymede: '#bbbbbb',
  callisto: '#888888', titan: '#ffcc88', phobos: '#998877', deimos: '#887766',
};

interface ToolbarItemProps {
  template: CelestialBodyTemplate;
  isMoon: boolean;
  disabled: boolean;
  disabledReason?: string;
}

const ToolbarItem = memo(function ToolbarItem({ template, isMoon, disabled, disabledReason }: ToolbarItemProps) {
  const selectedToolId = useUIStore(s => s.selectedToolId);
  const setSelectedTool = useUIStore(s => s.setSelectedTool);
  const selected = selectedToolId === template.id;

  const handleClick = () => {
    if (disabled) return;
    if (template.id === 'sun') {
      setSelectedTool(selected ? null : 'sun');
    } else {
      setSelectedTool(selected ? null : template.id);
    }
  };

  return (
    <div
      className={`toolbar-item ${isMoon ? 'moon' : ''} ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={handleClick}
      title={disabled ? (disabledReason ?? '已禁用') : template.name}
    >
      <span className="color-dot" style={{ background: DEFAULT_DOT_COLORS[template.id] ?? '#888' }} />
      <span className="item-name">{template.name}</span>
      <span className="item-adjusted-note">※修正</span>
    </div>
  );
});

function groupTemplates(): { title: string; items: CelestialBodyTemplate[] }[] {
  const star = BUILD_CELESTIAL_TEMPLATES.filter(t => t.type === 'star');
  const planets = BUILD_CELESTIAL_TEMPLATES.filter(t => t.type === 'planet');
  const moons = BUILD_CELESTIAL_TEMPLATES.filter(t => t.type === 'moon');

  const moonGroups: Record<string, CelestialBodyTemplate[]> = {};
  for (const m of moons) {
    const parent = m.parentId ?? 'other';
    if (!moonGroups[parent]) moonGroups[parent] = [];
    moonGroups[parent].push(m);
  }

  const groups: { title: string; items: CelestialBodyTemplate[] }[] = [
    { title: '恒星', items: star },
    { title: '行星', items: planets },
  ];

  for (const [parentId, items] of Object.entries(moonGroups)) {
    const parentName = BUILD_CELESTIAL_TEMPLATES.find(t => t.id === parentId)?.name ?? parentId;
    groups.push({ title: `${parentName} 的卫星`, items });
  }

  return groups;
}

export default function CelestialToolbar() {
  const hasSun = useBuildStore(s => s.bodies.some(b => b.templateId === 'sun'));
  const groups = groupTemplates();

  return (
    <div className="toolbar">
      <div className="toolbar-header">天体工具栏</div>
      <div className="toolbar-adjusted-tip">※ 数据已修正，便于搭建</div>
      {groups.map(group => (
        <div key={group.title} className="toolbar-group">
          <div className="toolbar-group-title">{group.title}</div>
          {group.items.map(item => (
            <ToolbarItem
              key={item.id}
              template={item}
              isMoon={item.type === 'moon'}
              disabled={item.id !== 'sun' && !hasSun}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
