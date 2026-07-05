/**
 * Security Events Logger
 * 
 * Logs security-relevant events to Supabase for audit trail.
 * Events: auth failures, unauthorized access, config changes, invite code usage
 */

const { supabase } = require('../supabase/client');

const EVENT_TYPES = [
  'auth_failure',      // Failed authentication attempt
  'unauthorized',      // Unauthorized access attempt
  'config_change',     // Clinic config modified
  'invite_created',    // Invite code generated
  'invite_redeemed',   // Invite code used
  'invite_revoked',    // Staff access revoked
  'staff_takeover',    // Bot paused for staff
  'patient_booking',   // Booking created
  'approval_action',   // Booking approved/rejected
  'system_alert',      // System-level alert
];

/**
 * Log a security event
 * @param {object} event — { type, actor, target, details, severity }
 *   type: one of EVENT_TYPES
 *   actor: who performed the action (e.g., 'admin:12345', 'staff:67890')
 *   target: what was affected (e.g., 'clinic:GLOW001', 'booking:uuid')
 *   details: human-readable description
 *   severity: 'low' | 'medium' | 'high' | 'critical'
 */
async function logSecurityEvent(event) {
  try {
    // Validate type
    if (!EVENT_TYPES.includes(event.type)) {
      console.warn(`[SECURITY_EVENT] Unknown event type: ${event.type}`);
    }
    
    const { error } = await supabase
      .from('security_events')
      .insert({
        event_type: event.type,
        actor: event.actor || 'unknown',
        target: event.target || 'unknown',
        details: event.details || '',
        severity: event.severity || 'low',
        created_at: new Date().toISOString()
      });
    
    if (error) {
      console.error('[SECURITY_EVENT] Failed to log:', error.message);
    }
  } catch (err) {
    console.error('[SECURITY_EVENT] Exception:', err.message);
  }
}

// Convenience methods
const logAuthFailure = (actor, target, details) => logSecurityEvent({ type: 'auth_failure', actor, target, details, severity: 'medium' });
const logUnauthorized = (actor, target, details) => logSecurityEvent({ type: 'unauthorized', actor, target, details, severity: 'high' });
const logConfigChange = (actor, target, details) => logSecurityEvent({ type: 'config_change', actor, target, details, severity: 'medium' });
const logInviteCreated = (actor, target, details) => logSecurityEvent({ type: 'invite_created', actor, target, details, severity: 'low' });
const logInviteRedeemed = (actor, target, details) => logSecurityEvent({ type: 'invite_redeemed', actor, target, details, severity: 'low' });
const logInviteRevoked = (actor, target, details) => logSecurityEvent({ type: 'invite_revoked', actor, target, details, severity: 'medium' });
const logStaffTakeover = (actor, target, details) => logSecurityEvent({ type: 'staff_takeover', actor, target, details, severity: 'low' });
const logApprovalAction = (actor, target, details, severity = 'medium') => logSecurityEvent({ type: 'approval_action', actor, target, details, severity });

module.exports = {
  logSecurityEvent,
  logAuthFailure,
  logUnauthorized,
  logConfigChange,
  logInviteCreated,
  logInviteRedeemed,
  logInviteRevoked,
  logStaffTakeover,
  logApprovalAction,
  EVENT_TYPES
};
