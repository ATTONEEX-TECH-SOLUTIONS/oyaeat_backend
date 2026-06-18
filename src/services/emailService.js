const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  // ── FIXED HOST FALLBACK ──
  // Replaced the broken '://gmail.com' string with a valid domain address
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const EMAIL_THEMES = {
  success: { primaryColor: '#2D6A4F', headerBg: '#1B433215', titleColor: '#1B4332', actionLabel: 'View Dashboard' },
  warning: { primaryColor: '#D4860B', headerBg: '#FEF3CD',   titleColor: '#856404', actionLabel: 'Review Profile' },
  danger:  { primaryColor: '#C0392B', headerBg: '#FDECEA',   titleColor: '#C0392B', actionLabel: 'Fix Issues' },
  info:    { primaryColor: '#2F80ED', headerBg: '#EAF2FF',   titleColor: '#2F80ED', actionLabel: 'Learn More' }
};

/**
 * Global Transactional Email Dispatcher Engine
 */
const sendPlatformNotification = async ({ to, businessName, headline, paragraphText, themeKey = 'info', actionUrl }) => {
  try {
    const theme = EMAIL_THEMES[themeKey] || EMAIL_THEMES.info;
    const fallbackUrl = actionUrl || process.env.VENDOR_DASHBOARD_URL || 'https://oyaeat.com';

    const htmlLayout = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #2D3748; max-width: 600px; margin: 0 auto; background-color: #F5F1EB; border-radius: 20px;">
        <div style="background-color: ${theme.headerBg}; padding: 20px; border-radius: 16px; text-align: center; margin-bottom: 24px; border: 1px solid ${theme.primaryColor}20;">
          <h1 style="color: ${theme.titleColor}; margin: 0; font-size: 20px; font-weight: 800; tracking: -0.02em;">
            ${headline}
          </h1>
        </div>
        
        <div style="background-color: #FFFFFF; padding: 24px; border-radius: 16px; border: 1px solid #D8E4DC; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
          <h2 style="color: #1B4332; margin-top: 0; font-size: 16px; font-weight: 700;">Hello ${businessName},</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #4A5568; margin-bottom: 24px;">
            ${paragraphText || ''}
          </p>
          
          <div style="text-align: center; margin: 24px 0 12px 0;">
            <a href="${fallbackUrl}" 
               style="background-color: ${theme.primaryColor}; color: #FFFFFF; padding: 12px 28px; text-decoration: none; font-weight: 700; border-radius: 12px; display: inline-block; font-size: 14px;">
               ${theme.actionLabel}
            </a>
          </div>
        </div>

        <div style="text-align: center; margin-top: 24px;">
          <hr style="border: none; border-top: 1px solid #D8E4DC; margin-bottom: 16px;" />
          <p style="font-size: 11px; color: #6B7C6E; margin: 0; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;">
            OyaEat Platform Fleet Administration Logistics Network
          </p>
        </div>
      </div>
    `;

    // ── FIXED TEXT-ONLY FALLBACK GUARD ──
    // Added string verification check before evaluating regex properties
    const textFallback = paragraphText 
      ? paragraphText.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '') 
      : '';

    const info = await transporter.sendMail({
      from: `"OyaEat Fleet Admin" <${process.env.SMTP_USER}>`,
      to,
      subject: `[OyaEat] ${headline}`,
      text: `Hello ${businessName}. ${textFallback}`,
      html: htmlLayout,
    });

    console.log('Centralized notification email sent successfully: %s', info.messageId);
    return true;
  } catch (error) {
    console.error('Central Email Engine caught failure:', error);
    return false;
  }
};

module.exports = { sendPlatformNotification };
