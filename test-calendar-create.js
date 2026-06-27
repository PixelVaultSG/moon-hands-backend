// Test: Create a sample appointment on Ash's calendar
const { createBookingEvent, testConnection } = require('./server/calendar-service');

async function test() {
    const calendarId = 'muhammadashraf.abdulrashid@gmail.com';
    
    // First test connection
    console.log('Testing connection...');
    const conn = await testConnection(calendarId);
    console.log('Connection result:', JSON.stringify(conn, null, 2));
    
    if (!conn.success) {
        console.error('Cannot connect:', conn.message);
        process.exit(1);
    }
    
    // Create test appointment
    console.log('\nCreating test appointment for John Doe...');
    const result = await createBookingEvent(calendarId, {
        summary: 'John Doe — Botox + HIFU + HydraFacial',
        startISO: '2026-06-29T14:00:00+08:00',
        endISO: '2026-06-29T15:30:00+08:00',
        description: 'Patient: John Doe\nPhone: +65 9123 4567\nTreatments: Botox, HIFU Face Lift, HydraFacial\nBooked via Moon Hands AI Test',
        patientPhone: '+6591234567'
    });
    
    console.log('Create result:', JSON.stringify(result, null, 2));
}

test().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
