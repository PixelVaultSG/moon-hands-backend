// Moon Hands — Google Calendar Verification Endpoint
// Allows clinics to test their calendar connection before going live

const { testConnection, validateAppointmentDate } = require('./calendar-service');

/**
 * Mount this on your Express app:
 *   app.get('/api/calendar/verify', require('./server/calendar-verify'));
 */
module.exports = async function calendarVerifyHandler(req, res) {
    const calendarId = req.query.calendarId || req.body?.calendarId;

    if (!calendarId) {
        return res.status(400).json({
            success: false,
            error: 'Missing calendarId parameter. Provide ?calendarId=your.email@gmail.com',
        });
    }

    console.log('[Calendar Verify] Testing connection for:', calendarId);
    const result = await testConnection(calendarId);
    res.status(result.success ? 200 : 400).json(result);
};

/**
 * Also export a date validation helper for the bot engine
 */
module.exports.validateDate = validateAppointmentDate;
