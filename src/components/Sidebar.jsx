import {
  Pencil,
  Eraser,
  Moon,
  Sun,
  Trash2,
  Save,
  FolderOpen,
  Download,
} from 'lucide-react';

const TOOLS = [
  { id: 'pencil', label: 'Crayon  ·  B', Icon: Pencil },
  { id: 'eraser', label: 'Gomme  ·  E', Icon: Eraser },
];

export default function Sidebar({
  tool,
  onToolChange,
  onClear,
  darkCanvas,
  onToggleDark,
  onSaveProject,
  onOpenProject,
  onExportImage,
}) {
  return (
    <nav className="rail">
      <div className="rail__group">
        {TOOLS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`tool-btn tip${tool === id ? ' is-active' : ''}`}
            data-tip={label}
            onClick={() => onToolChange(id)}
            aria-pressed={tool === id}
          >
            <Icon size={19} strokeWidth={1.6} />
          </button>
        ))}
      </div>

      <div className="rail__group">
        <button
          className="tool-btn tip"
          data-tip="Ouvrir un projet  ·  Ctrl+O"
          onClick={onOpenProject}
        >
          <FolderOpen size={18} strokeWidth={1.6} />
        </button>
        <button
          className="tool-btn tip"
          data-tip="Enregistrer le projet  ·  Ctrl+S"
          onClick={onSaveProject}
        >
          <Save size={18} strokeWidth={1.6} />
        </button>
        <button
          className="tool-btn tip"
          data-tip="Exporter en PNG  ·  Ctrl+Maj+E"
          onClick={onExportImage}
        >
          <Download size={18} strokeWidth={1.6} />
        </button>
      </div>

      <div className="rail__spacer" />

      <div className="rail__group">
        <button
          className={`tool-btn tip${darkCanvas ? ' is-active' : ''}`}
          data-tip={darkCanvas ? 'Calque clair' : 'Calque sombre'}
          onClick={onToggleDark}
          aria-pressed={darkCanvas}
        >
          {darkCanvas ? (
            <Sun size={18} strokeWidth={1.6} />
          ) : (
            <Moon size={18} strokeWidth={1.6} />
          )}
        </button>
        <div className="rail__divider" />
        <button className="tool-btn tip" data-tip="Effacer tout" onClick={onClear}>
          <Trash2 size={18} strokeWidth={1.6} />
        </button>
      </div>
    </nav>
  );
}
