import React from 'react';
import { motion } from 'framer-motion';

const POLICY_CODE = `{
  "version": "1.0",
  "agentId": "eip155:11155111:0x8004...:42",
  "constraints": {
    "maxTransaction": {
      "amount": "1000000",
      "token": "USDC",
      "chain": "base"
    },
    "dailyLimit": {
      "amount": "5000000",
      "token": "USDC",
      "chain": "base"
    },
    "allowedRecipients": [
      "0xServiceA...",
      "0xServiceB..."
    ],
    "allowedTokens": ["USDC", "USDT"],
    "allowedChains": ["base", "ethereum"]
  }
}`;

export default function PolicySchemaShowcase() {
  return (
    <div className="premium-card glass" style={{ 
      padding: '2px', 
      background: 'linear-gradient(135deg, rgba(124, 92, 255, 0.3), rgba(34, 211, 238, 0.3))',
      borderRadius: '16px'
    }}>
      <div style={{ 
        background: 'var(--surface)', 
        borderRadius: '14px', 
        padding: '32px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Glow corner */}
        <div style={{ 
          position: 'absolute', 
          top: '-20%', 
          right: '-20%', 
          width: '200px', 
          height: '200px', 
          background: 'var(--primary)', 
          filter: 'blur(80px)', 
          opacity: 0.1 
        }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#EF4444' }} />
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#F59E0B' }} />
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#22C55E' }} />
          </div>
          <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            vcr-policy.json
          </div>
        </div>

        <pre style={{ 
          margin: 0, 
          fontFamily: 'var(--font-mono)', 
          fontSize: '0.9rem', 
          lineHeight: 1.6,
          color: 'var(--text-primary)',
          overflowX: 'auto'
        }}>
          <code>
            {POLICY_CODE.split('\n').map((line, i) => (
              <div key={i} style={{ display: 'flex' }}>
                <span style={{ 
                  color: 'var(--text-secondary)', 
                  width: '32px', 
                  userSelect: 'none', 
                  opacity: 0.5 
                }}>{i + 1}</span>
                <span dangerouslySetInnerHTML={{ 
                  __html: line
                    .replace(/"([^"]+)":/g, '<span style="color: var(--accent)">"$1":</span>')
                    .replace(/: "([^"]+)"/g, ': <span style="color: var(--success)">"$1"</span>')
                    .replace(/: (\\d+)/g, ': <span style="color: var(--warning)">$1</span>')
                }} />
              </div>
            ))}
          </code>
        </pre>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          style={{ 
            marginTop: '32px', 
            paddingTop: '24px', 
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', gap: '12px' }}>
            <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 700 }}>IPFS PINNED</span>
            <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 700 }}>DETERMINISTIC CID</span>
          </div>
          <button style={{ 
            background: 'rgba(124, 92, 255, 0.1)', 
            border: '1px solid var(--primary)', 
            color: 'var(--primary)', 
            padding: '6px 12px', 
            borderRadius: '6px', 
            fontSize: '0.75rem', 
            fontWeight: 600,
            cursor: 'pointer'
          }}>
            Copy CID
          </button>
        </motion.div>
      </div>
    </div>
  );
}
