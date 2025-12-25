const express = require('express');
const db = require('../database/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get all board data
router.get('/board', (req, res) => {
  try {
    const data = db.getBoardData();
    res.json(data);
  } catch (err) {
    console.error('Get board error:', err);
    res.status(500).json({ error: 'Failed to get board data' });
  }
});

// Stats
router.get('/stats', (req, res) => {
  try {
    res.json(db.getStats());
  } catch (err) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// === STOCK ===
router.get('/stock/:category', (req, res) => {
  try {
    const { category } = req.params;
    if (!['out', 'low'].includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    res.json(db.getStockItems(category));
  } catch (err) {
    res.status(500).json({ error: 'Failed to get stock items' });
  }
});

router.post('/stock', authenticate, (req, res) => {
  try {
    const { category, item, detail, severity } = req.body;
    if (!category || !item) {
      return res.status(400).json({ error: 'Category and item required' });
    }
    const id = db.addStockItem(category, item.trim(), detail?.trim() || '', severity || 'low', req.user.userId);
    req.app.get('io').to('ops-board').emit('sync', { type: 'refresh' });
    res.status(201).json({ success: true, id });
  } catch (err) {
    console.error('Add stock error:', err);
    res.status(500).json({ error: 'Failed to add stock item' });
  }
});

router.delete('/stock/:id', authenticate, (req, res) => {
  try {
    db.resolveStockItem(parseInt(req.params.id), req.user.userId);
    req.app.get('io').to('ops-board').emit('sync', { type: 'refresh' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve item' });
  }
});

// === MAINTENANCE ===
router.get('/maintenance', (req, res) => {
  try {
    res.json(db.getMaintenanceItems());
  } catch (err) {
    res.status(500).json({ error: 'Failed to get maintenance' });
  }
});

router.post('/maintenance', authenticate, (req, res) => {
  try {
    const { item, detail, severity } = req.body;
    if (!item) {
      return res.status(400).json({ error: 'Item required' });
    }
    const id = db.addMaintenanceItem(item.trim(), detail?.trim() || '', severity || 'maint', req.user.userId);
    req.app.get('io').to('ops-board').emit('sync', { type: 'refresh' });
    res.status(201).json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add maintenance' });
  }
});

router.delete('/maintenance/:id', authenticate, (req, res) => {
  try {
    db.resolveMaintenanceItem(parseInt(req.params.id), req.user.userId);
    req.app.get('io').to('ops-board').emit('sync', { type: 'refresh' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve maintenance' });
  }
});

// === NOTES ===
router.get('/notes', (req, res) => {
  try {
    res.json(db.getNotes());
  } catch (err) {
    res.status(500).json({ error: 'Failed to get notes' });
  }
});

router.post('/notes', authenticate, (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text required' });
    }
    const id = db.addNote(text.trim(), req.user.userId);
    req.app.get('io').to('ops-board').emit('sync', { type: 'refresh' });
    res.status(201).json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add note' });
  }
});

router.delete('/notes/:id', authenticate, (req, res) => {
  try {
    db.resolveNote(parseInt(req.params.id), req.user.userId);
    req.app.get('io').to('ops-board').emit('sync', { type: 'refresh' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve note' });
  }
});

// === SHIFT LOG ===
router.get('/shift-log', (req, res) => {
  try {
    res.json(db.getShiftLog());
  } catch (err) {
    res.status(500).json({ error: 'Failed to get shift log' });
  }
});

router.post('/shift-log', authenticate, (req, res) => {
  try {
    const { shiftType, focus, eta, notes } = req.body;
    if (!shiftType || !focus) {
      return res.status(400).json({ error: 'Shift type and focus required' });
    }
    const id = db.addShiftEntry(shiftType, focus.trim(), eta?.trim() || '', notes?.trim() || '', req.user.userId);
    req.app.get('io').to('ops-board').emit('sync', { type: 'refresh' });
    res.status(201).json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add shift entry' });
  }
});

router.delete('/shift-log/:id', authenticate, (req, res) => {
  try {
    db.deleteShiftEntry(parseInt(req.params.id), req.user.userId);
    req.app.get('io').to('ops-board').emit('sync', { type: 'refresh' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete shift entry' });
  }
});

// === SETTINGS ===
router.get('/settings', (req, res) => {
  try {
    const settings = db.getAllSettings();
    res.json(settings.reduce((acc, { key, value }) => ({ ...acc, [key]: value }), {}));
  } catch (err) {
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

router.put('/settings/:key', authenticate, (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    db.setSetting(key, value);
    req.app.get('io').to('ops-board').emit('sync', { type: 'refresh' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// === EXPORT ===
router.get('/export', (req, res) => {
  try {
    const data = db.getBoardData();
    const s = data.settings;
    const ts = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' });
    
    const brief = `
BASIL & GRAPE · CHEF OPS BRIEF
${s.address || '46-48 George Street, Croydon, CR0 1PB'}
Generated: ${ts}
${'═'.repeat(60)}

FLOOR LEAD: ${s.floor_lead || 'N/A'}
CONTACT: ${s.phone || 'N/A'}

${'─'.repeat(60)}
OUT OF STOCK (${data.out.length})
${'─'.repeat(60)}
${data.out.map(i => `• ${i.item}${i.detail ? ': ' + i.detail : ''}`).join('\n') || 'None'}

${'─'.repeat(60)}
RUNNING LOW (${data.low.length})
${'─'.repeat(60)}
${data.low.map(i => `• ${i.item}${i.detail ? ': ' + i.detail : ''}`).join('\n') || 'None'}

${'─'.repeat(60)}
MAINTENANCE (${data.maint.length})
${'─'.repeat(60)}
${data.maint.map(i => `• ${i.item}${i.detail ? ': ' + i.detail : ''}`).join('\n') || 'None'}

${'─'.repeat(60)}
NOTES
${'─'.repeat(60)}
${data.notes.map(n => `• ${n.text}`).join('\n') || 'None'}

${'─'.repeat(60)}
SHIFT HANDOVERS
${'─'.repeat(60)}
${data.shiftLog.slice(0, 5).map(h => `• ${h.shift_type}: ${h.focus}${h.eta ? ' → ' + h.eta : ''}`).join('\n') || 'None'}

${'═'.repeat(60)}
`.trim();
    
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="basil-grape-brief-${new Date().toISOString().split('T')[0]}.txt"`);
    res.send(brief);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export' });
  }
});

// Activity log
router.get('/activity', authenticate, (req, res) => {
  try {
    res.json(db.getActivityLog());
  } catch (err) {
    res.status(500).json({ error: 'Failed to get activity log' });
  }
});

module.exports = router;
