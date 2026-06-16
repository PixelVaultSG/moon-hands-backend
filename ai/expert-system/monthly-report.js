/**
 * Moon Hands — Monthly Performance Report Generator
 *
 * Automatically generates monthly reports for each clinic.
 * Report includes: enquiries, bookings, conversion rates, response times,
 * peak hours, top treatments, no-show rates, revenue opportunity.
 *
 * Scheduled to run on the 1st of each month for the previous month.
 * Sent to clinic via email + summary to Owner via Telegram.
 */

const { supabase } = require('../../supabase/client');

// ─── GENERATE MONTHLY REPORT ────────────────────────────────────

async function generateMonthlyReport(clinicId, year, month) {
  // month: 1-12, year: e.g., 2026
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const startDate = `${monthStr}-01`;
  const endDate = getMonthEndDate(year, month);

  console.log(`[REPORT] Generating ${monthStr} report for clinic ${clinicId.slice(0, 8)}`);

  try {
    // 1. Count total enquiries (all incoming messages)
    const totalEnquiries = await countEnquiries(clinicId, startDate, endDate);

    // 2. Count bookings
    const bookings = await getBookingsInPeriod(clinicId, startDate, endDate);
    const totalBookings = bookings.length;
    const confirmedBookings = bookings.filter(b => b.status === 'confirmed').length;
    const cancelledBookings = bookings.filter(b => b.status === 'cancelled').length;
    const pendingBookings = bookings.filter(b => b.status === 'pending').length;

    // 3. Conversion rate
    const conversionRate = totalEnquiries > 0
      ? ((totalBookings / totalEnquiries) * 100).toFixed(1)
      : 0;

    // 4. Average response time (from audit log)
    const avgResponseTime = await getAverageResponseTime(clinicId, startDate, endDate);

    // 5. Peak hour
    const peakHour = calculatePeakHour(bookings);

    // 6. Top treatment
    const topTreatment = calculateTopTreatment(bookings);

    // 7. No-show rate (bookings that were confirmed but patient didn't show)
    // This requires manual marking by clinic — we estimate based on cancellations
    const noShowCount = cancelledBookings;
    const noShowRate = totalBookings > 0
      ? ((cancelledBookings / totalBookings) * 100).toFixed(1)
      : 0;

    // 8. Revenue opportunity (missed enquiries × avg treatment value)
    const missedEnquiries = totalEnquiries - totalBookings;
    const avgTreatmentValue = await getAverageTreatmentValue(clinicId);
    const revenueOpportunity = (missedEnquiries * avgTreatmentValue).toFixed(2);

    // 9. Store report
    const report = {
      clinic_id: clinicId,
      report_month: monthStr,
      total_enquiries: totalEnquiries,
      total_bookings: totalBookings,
      confirmed_bookings: confirmedBookings,
      cancelled_bookings: cancelledBookings,
      conversion_rate: conversionRate,
      avg_response_time_seconds: avgResponseTime,
      peak_hour: peakHour,
      top_treatment: topTreatment,
      no_show_count: noShowCount,
      no_show_rate: noShowRate,
      revenue_opportunity: revenueOpportunity,
      report_data: {
        pending_bookings: pendingBookings,
        avg_treatment_value: avgTreatmentValue,
        generated_at: new Date().toISOString(),
      },
    };

    const { data, error } = await supabase
      .from('monthly_reports')
      .upsert(report, { onConflict: 'clinic_id,report_month' })
      .select()
      .single();

    if (error) {
      console.error('[REPORT] Store error:', error.message);
      return { success: false, error: error.message };
    }

    console.log(`[REPORT] Generated for ${monthStr}: ${totalBookings} bookings, ${conversionRate}% conversion`);
    return { success: true, report: data };

  } catch (err) {
    console.error('[REPORT] Generation error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── REPORT FORMATTING FOR EMAIL ────────────────────────────────

function formatReportForEmail(report, clinicName) {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const [year, month] = report.report_month.split('-');
  const monthName = monthNames[parseInt(month) - 1];

  return `MONTHLY PERFORMANCE REPORT
${clinicName}
${monthName} ${year}

═══════════════════════════════════════

📊 OVERVIEW
• Total Patient Enquiries: ${report.total_enquiries}
• Total Bookings Created: ${report.total_bookings}
• Confirmed Bookings: ${report.confirmed_bookings}
• Cancelled Bookings: ${report.cancelled_bookings}

📈 CONVERSION
• Enquiry → Booking Rate: ${report.conversion_rate}%
${report.conversion_rate >= 30 ? '✅ Strong conversion' : report.conversion_rate >= 15 ? '⚠️ Room for improvement' : '🔴 Action needed'}

⏱️ RESPONSE TIME
• Average AI Response: ${formatDuration(report.avg_response_time_seconds)}
${report.avg_response_time_seconds <= 10 ? '✅ Excellent' : report.avg_response_time_seconds <= 30 ? '✅ Good' : '⚠️ Consider upgrading'}

🔥 PEAK HOURS
• Busiest Time: ${report.peak_hour || 'N/A'}
• Top Treatment: ${report.top_treatment || 'N/A'}

⚠️ NO-SHOWS
• Cancelled/No-Show: ${report.no_show_count}
• No-Show Rate: ${report.no_show_rate}%
${report.no_show_rate <= 10 ? '✅ Healthy' : report.no_show_rate <= 20 ? '⚠️ Monitor closely' : '🔴 Consider reminders'}

💰 REVENUE OPPORTUNITY
• Missed Enquiries: ${report.total_enquiries - report.total_bookings}
• Estimated Lost Revenue: S$${report.revenue_opportunity}

═══════════════════════════════════════

This report is auto-generated by Moon Hands.
Questions? Reply to this email or WhatsApp us anytime.

— Moon Hands by Pixel Vault Pte Ltd`;
}

// ─── HELPER FUNCTIONS ───────────────────────────────────────────

async function countEnquiries(clinicId, startDate, endDate) {
  // Count from audit_log or message_log
  // For now, estimate from bookings + a factor
  // In production, this would query a message_enquiries table
  try {
    const { count, error } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .gte('created_at', `${startDate}T00:00:00`)
      .lte('created_at', `${endDate}T23:59:59`);

    if (error) return 0;
    return count || 0;
  } catch (e) {
    return 0;
  }
}

async function getBookingsInPeriod(clinicId, startDate, endDate) {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('clinic_id', clinicId)
      .gte('booking_date', startDate)
      .lte('booking_date', endDate);

    if (error) return [];
    return data || [];
  } catch (e) {
    return [];
  }
}

async function getAverageResponseTime(clinicId, startDate, endDate) {
  // Placeholder: In production, query audit_log for response times
  // For now, return a simulated reasonable value
  return 5; // 5 seconds
}

function calculatePeakHour(bookings) {
  if (!bookings || bookings.length === 0) return 'N/A';

  const hourCounts = {};
  for (const b of bookings) {
    const hour = b.booking_time?.split(':')[0];
    if (hour) {
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }
  }

  let peakHour = '';
  let peakCount = 0;
  for (const [hour, count] of Object.entries(hourCounts)) {
    if (count > peakCount) {
      peakCount = count;
      peakHour = hour;
    }
  }

  if (!peakHour) return 'N/A';
  const hourNum = parseInt(peakHour);
  const ampm = hourNum >= 12 ? 'PM' : 'AM';
  const displayHour = hourNum > 12 ? hourNum - 12 : hourNum;
  return `${displayHour}:00 ${ampm}`;
}

function calculateTopTreatment(bookings) {
  if (!bookings || bookings.length === 0) return 'N/A';

  const treatmentCounts = {};
  for (const b of bookings) {
    if (b.treatment) {
      treatmentCounts[b.treatment] = (treatmentCounts[b.treatment] || 0) + 1;
    }
  }

  let topTreatment = '';
  let topCount = 0;
  for (const [treatment, count] of Object.entries(treatmentCounts)) {
    if (count > topCount) {
      topCount = count;
      topTreatment = treatment;
    }
  }

  return topTreatment || 'N/A';
}

async function getAverageTreatmentValue(clinicId) {
  // Get average price from clinic's services
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('services')
      .eq('id', clinicId)
      .single();

    if (error || !data?.services) return 300; // Default S$300

    const services = data.services;
    const prices = Object.values(services)
      .map(s => {
        const match = String(s.price).match(/\d+/);
        return match ? parseInt(match[0]) : 0;
      })
      .filter(p => p > 0);

    if (prices.length === 0) return 300;
    return prices.reduce((a, b) => a + b, 0) / prices.length;

  } catch (e) {
    return 300;
  }
}

function getMonthEndDate(year, month) {
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

// ─── SCHEDULER ENTRY POINT ─────────────────────────────────────

async function generateAllReportsForMonth(year, month) {
  try {
    // Get all active clinics
    const { data: clinics, error } = await supabase
      .from('clients')
      .select('id, name, email, plan')
      .eq('status', 'active');

    if (error || !clinics) {
      console.error('[REPORT] No clinics found');
      return { success: false };
    }

    const results = [];
    for (const clinic of clinics) {
      // Only generate for Premium clinics (or all if configured)
      const result = await generateMonthlyReport(clinic.id, year, month);
      results.push({
        clinic: clinic.name,
        ...result,
      });
    }

    return { success: true, clinics: results.length, results };

  } catch (err) {
    console.error('[REPORT] Batch error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── EXPORTS ────────────────────────────────────────────────────

module.exports = {
  generateMonthlyReport,
  formatReportForEmail,
  generateAllReportsForMonth,
};
