import React, { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Handle,
  Position,
  MarkerType,
  ConnectionLineType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

/* ================================================================== */
/*  Architecture Diagram — React Flow                                   */
/*  NB styled interactive system overview for VCR (Technical Deep Dive) */
/* ================================================================== */

/* ---------- Custom Node Component ---------- */
function ArchNode({ data }) {
  const d = data;

  const bg = d.dark ? '#111827' : '#FEFCE8';
  const textColor = d.dark ? '#fff' : '#000';
  const itemColor = d.dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)';
  const borderColor = d.dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)';

  return (
    <div
      style={{
        background: bg,
        border: `3px solid ${d.color}`,
        boxShadow: `5px 5px 0 ${d.color}`,
        padding: d.items ? '16px 20px' : '12px 18px',
        minWidth: d.wide ? 260 : 200,
        fontFamily: "'Space Grotesk', sans-serif",
        position: 'relative',
        transition: 'transform 0.1s',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: d.color, width: 10, height: 10, border: '2px solid #000' }} />
      <Handle type="target" position={Position.Left} id="left" style={{ background: d.color, width: 10, height: 10, border: '2px solid #000' }} />
      <Handle type="source" position={Position.Bottom} style={{ background: d.color, width: 10, height: 10, border: '2px solid #000' }} />
      <Handle type="source" position={Position.Right} id="right" style={{ background: d.color, width: 10, height: 10, border: '2px solid #000' }} />

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: d.items ? 12 : 0 }}>
        <span style={{ fontSize: '1.4rem' }}>{d.icon}</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: '0.9rem', color: textColor, lineHeight: 1.2 }}>{d.label}</div>
          {d.sublabel && (
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.6rem', color: d.color, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 4 }}>
              {d.sublabel}
            </div>
          )}
        </div>
      </div>

      {/* items list */}
      {d.items && (
        <div style={{ borderTop: `2px solid ${borderColor}`, paddingTop: 10, marginTop: 4 }}>
          {d.items.map((item) => (
            <div key={item} style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.65rem', color: itemColor, lineHeight: 1.8, paddingLeft: 4 }}>
              ▸ {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Node types registration ---------- */
const nodeTypes = {
  arch: ArchNode,
};

/* ---------- Main Component ---------- */
export default function ArchitectureFlow() {
  const nodes = useMemo(
    () => [
      // ==== SETUP PHASE (Top) ====
      {
        id: 'hoodi',
        type: 'arch',
        position: { x: 40, y: 20 },
        data: {
          label: 'BitGo on Hoodi',
          sublabel: 'Custodial Setup',
          icon: 'MPC',
          color: '#10B981', // Green
          items: ['Owner creates custodial MPC wallet', 'Generates BitGo policy hash'],
          wide: true,
        },
      },
      {
        id: 'ipfs',
        type: 'arch',
        position: { x: 380, y: 20 },
        data: {
          label: 'Fileverse & IPFS',
          sublabel: 'On-Chain Provenance',
          icon: 'IPFS',
          color: '#EF4444', // Red
          items: ['Pins VCR policy document to IPFS', 'Integrity Link: Stores BitGo policy hash'],
          wide: true,
        },
      },
      {
        id: 'ens_setup',
        type: 'arch',
        position: { x: 720, y: 20 },
        data: {
          label: 'ENS Text Records',
          sublabel: 'Identity & Pointers',
          icon: 'ENS',
          color: '#8B5CF6', // Purple
          items: ['ENSIP-25 link (proves genuine ownership)', 'vcr.policy pointer to IPFS', 'Ties to ERC-8004 registration'],
          wide: true,
        },
      },

      // ==== VERIFICATION PHASE (Bottom) ====
      {
        id: 'pay_agent',
        type: 'arch',
        position: { x: 40, y: 300 },
        data: {
          label: 'Service / Agent',
          sublabel: 'Payment Initiator',
          icon: 'CLI',
          color: '#3B82F6', // Blue
          items: ['Every payment attempt', 'Initiates spend request via canAgentSpend()'],
          wide: true,
        },
      },
      {
        id: 'verifier',
        type: 'arch',
        position: { x: 380, y: 280 },
        data: {
          label: 'VCR canAgentSpend()',
          sublabel: 'Off-Chain Evaluation',
          icon: 'VCR',
          color: '#F59E0B', // Yellow
          items: ['Reads ENS name & fetches policy from IPFS', 'Checks all 6 constraints sequentially', 'If blocked: BitGo is NEVER contacted'],
          wide: true,
          dark: true,
        },
      },
      {
        id: 'execute',
        type: 'arch',
        position: { x: 720, y: 300 },
        data: {
          label: 'wallet.sendMany()',
          sublabel: 'On-Chain Execution',
          icon: 'Tx',
          color: '#10B981', // Green
          items: ['Called ONLY if every check passes', 'Executes transfer on BitGo MPC'],
          wide: true,
        },
      },
    ],
    []
  );

  const edges = useMemo(
    () => [
      // Setup phase edges
      {
        id: 'e-hoodi-ipfs',
        source: 'hoodi',
        target: 'ipfs',
        sourceHandle: 'right',
        targetHandle: 'left',
        label: 'Include Hash',
        style: { stroke: '#10B981', strokeWidth: 2, strokeDasharray: '5 5' },
        labelStyle: { fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, fill: '#10B981', background: '#FEFCE8' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981' },
      },
      {
        id: 'e-ipfs-ens',
        source: 'ipfs',
        target: 'ens_setup',
        sourceHandle: 'right',
        targetHandle: 'left',
        label: 'Pin & Set Record',
        style: { stroke: '#EF4444', strokeWidth: 2, strokeDasharray: '5 5' },
        labelStyle: { fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, fill: '#EF4444', background: '#FEFCE8' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#EF4444' },
      },

      // Verification phase edges
      {
        id: 'e-pay-verifier',
        source: 'pay_agent',
        target: 'verifier',
        sourceHandle: 'right',
        targetHandle: 'left',
        label: 'Call',
        animated: true,
        style: { stroke: '#3B82F6', strokeWidth: 2.5 },
        labelStyle: { fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, fill: '#3B82F6', background: '#FEFCE8', padding: 4 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#3B82F6' },
      },
      {
        id: 'e-verifier-ens',
        source: 'verifier',
        target: 'ens_setup',
        sourceHandle: 'top',
        targetHandle: 'bottom',
        label: 'Read ENS Name',
        style: { stroke: '#8B5CF6', strokeWidth: 2, strokeDasharray: '5 5' },
        labelStyle: { fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, fill: '#8B5CF6', background: '#FEFCE8' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#8B5CF6' },
      },
      {
        id: 'e-verifier-ipfs',
        source: 'verifier',
        target: 'ipfs',
        sourceHandle: 'top',
        targetHandle: 'bottom',
        label: 'Fetch Policy',
        style: { stroke: '#EF4444', strokeWidth: 2, strokeDasharray: '5 5' },
        labelStyle: { fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, fill: '#EF4444', background: '#FEFCE8' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#EF4444' },
      },
      {
        id: 'e-verifier-execute',
        source: 'verifier',
        target: 'execute',
        sourceHandle: 'right',
        targetHandle: 'left',
        label: 'Checks Pass',
        animated: true,
        style: { stroke: '#F59E0B', strokeWidth: 2.5 },
        labelStyle: { fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, fill: '#F59E0B', background: '#FEFCE8' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#F59E0B' },
      },
    ],
    []
  );

  const onInit = useCallback((instance) => {
    setTimeout(() => instance.fitView({ padding: 0.15 }), 100);
  }, []);

  return (
    <div
      style={{
        width: '100%',
        height: 600,
        border: '3px solid var(--nb-ink)',
        boxShadow: '6px 6px 0 var(--nb-ink)',
        background: 'var(--nb-board)',
        position: 'relative',
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={onInit}
        connectionLineType={ConnectionLineType.Step}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={true}
        nodesConnectable={false}
        panOnDrag={true}
        zoomOnScroll={true}
        minZoom={0.3}
        maxZoom={1.5}
        defaultEdgeOptions={{ type: 'step' }}
      >
        <Background color="var(--nb-ink)" gap={20} size={1} />
      </ReactFlow>

      {/* Corner badge */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 12,
          fontFamily: "'Space Mono', monospace",
          fontSize: '0.65rem',
          fontWeight: 700,
          color: 'var(--nb-ink)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          pointerEvents: 'none',
          background: 'var(--nb-board)',
          padding: '4px 8px',
          border: '2px solid var(--nb-ink)'
        }}
      >
        Draggable View
      </div>
    </div>
  );
}
