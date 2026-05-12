import React, { useState, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";

const WIDGETS = [
  { kind: "button", label: "Button", emoji: "▶︎" },
  { kind: "text", label: "Text", emoji: "T" },
  { kind: "card", label: "Card", emoji: "▢" },
];

const ITEM_TYPE = "WIDGET";

// Sidebar widget card — the drag source.
// Each card sets `draggable=true` via react-dnd's connector ref.
function WidgetCard({ kind, label, emoji }) {
  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: ITEM_TYPE,
      item: { kind, label },
      collect: (m) => ({ isDragging: m.isDragging() }),
    }),
    [kind, label],
  );
  return (
    <div
      ref={drag}
      data-cy={`widget-card-${kind}`}
      style={{
        border: "1px solid #ccd",
        borderRadius: 6,
        padding: "10px 12px",
        margin: "8px 0",
        background: isDragging ? "#eef" : "#fff",
        cursor: "grab",
        userSelect: "none",
      }}
    >
      <span style={{ fontFamily: "monospace", marginRight: 8 }}>{emoji}</span>
      {label}
    </div>
  );
}

// Canvas drop zone — accepts any widget and records the drop's x/y position.
function Canvas({ placed, setPlaced }) {
  const ref = useRef(null);

  const [{ isOver }, drop] = useDrop(
    () => ({
      accept: ITEM_TYPE,
      drop: (item, monitor) => {
        const offset = monitor.getClientOffset();
        const rect = ref.current?.getBoundingClientRect();
        if (!offset || !rect) return;
        const x = Math.round(offset.x - rect.left);
        const y = Math.round(offset.y - rect.top);
        setPlaced((prev) => [
          ...prev,
          { ...item, x, y, id: Date.now() + Math.random() },
        ]);
      },
      collect: (m) => ({ isOver: m.isOver() }),
    }),
    [],
  );

  const setRefs = (node) => {
    ref.current = node;
    drop(node);
  };

  return (
    <div
      ref={setRefs}
      data-cy="canvas"
      style={{
        flex: 1,
        margin: 16,
        background: isOver ? "#f5f7ff" : "#fafafa",
        border: "1px dashed #99a",
        // No border-radius — corner-keyword drops (topLeft / bottomRight)
        // need the literal corner pixel to belong to this element's hit box.
        borderRadius: 0,
        position: "relative",
        minHeight: 500,
      }}
    >
      {placed.length === 0 && (
        <div
          data-cy="canvas-empty"
          style={{
            position: "absolute",
            top: "50%",
            left: 0,
            right: 0,
            textAlign: "center",
            color: "#99a",
            transform: "translateY(-50%)",
            pointerEvents: "none",
          }}
        >
          Drop widgets here
        </div>
      )}
      {placed.map((p) => (
        <div
          key={p.id}
          data-cy={`placed-${p.kind}`}
          data-x={p.x}
          data-y={p.y}
          style={{
            position: "absolute",
            left: p.x,
            top: p.y,
            transform: "translate(-50%, -50%)",
            padding: "6px 10px",
            border: "1px solid #88a",
            borderRadius: 4,
            background: "#fff",
            fontSize: 12,
          }}
        >
          {p.label} @ ({p.x},{p.y})
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [placed, setPlaced] = useState([]);
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: "system-ui, sans-serif",
        margin: 0,
      }}
    >
      <aside
        data-cy="sidebar"
        style={{
          width: 220,
          padding: 16,
          borderRight: "1px solid #ddd",
          background: "#f8f8fb",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14, color: "#557" }}>Widgets</h3>
        {WIDGETS.map((w) => (
          <WidgetCard key={w.kind} {...w} />
        ))}
        <div
          data-cy="placed-count"
          style={{ marginTop: 24, fontSize: 12, color: "#669" }}
        >
          Dropped: {placed.length}
        </div>
        <button
          data-cy="clear-canvas"
          onClick={() => setPlaced([])}
          style={{
            marginTop: 8,
            padding: "4px 8px",
            border: "1px solid #99a",
            borderRadius: 4,
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Clear
        </button>
      </aside>
      <Canvas placed={placed} setPlaced={setPlaced} />
    </div>
  );
}
