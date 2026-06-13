const nodemailer = require("nodemailer");

// FIXED: Hardcoding your credentials directly to bypass .env parsing format errors
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com", 
  port: 587,
  secure: false, // false for port 587
  auth: {
    // We strip out process.env references here to bypass terminal cache loops completely
    user: "bolatitoamoho@gmail.com", 
    pass: "ekfazgtjocwyuocx", // Your exact 16-character Google App Password with no spaces
  },
});


/**
 * Generates email copy dynamically based on status parameters and user roles
 */
const getStatusEmailTemplate = (firstName, status, userRole = "rider") => {
  let subject = "";
  let heading = "";
  let messageText = "";
  let buttonLabel = "";
  
  // Dynamic portal redirect logic based on who is receiving the email
  const isVendor = userRole.toLowerCase() === "vendor" || userRole.toLowerCase() === "restaurant";
  const portalName = isVendor ? "Restaurant Hub" : "Rider Network";
  const loginPath = isVendor ? "/vendor/login" : "/rider/login";
  const buttonUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}${loginPath}`;

  // 🤝 GENERATE EMAIL COPY MATRIX
  if (status === "verified") {
    subject = `🎉 Your ${portalName} Documents Have Been Verified!`;
    heading = "Documents Verified Successfully!";
    messageText = isVendor
      ? `Great news! Your business permits, menu details, and restaurant documentation have been verified by our compliance operations team. Your merchant account is now queued for activation.`
      : `Great news! Your driver's license and vehicle profiles have been completely verified by our compliance operations team. Your account permissions are now queued for activation.`;
    buttonLabel = "View Portal Status";
  } 
  else if (status === "active") {
    subject = `🚀 Account Activated - Welcome to OyaEat!`;
    heading = "Your Account is Now Active!";
    messageText = isVendor
      ? `Congratulations! Your restaurant merchant profile has been fully activated. You can now configure your opening hours, upload menus, and begin accepting incoming food orders from customers.`
      : `Congratulations! Your rider account has been fully activated. You can now toggle your shift status to 'Go Online', accept incoming dispatch runs near you, and start earning.`;
    buttonLabel = isVendor ? "Open Store Hub" : "Go to Dashboard";
  } 
  else if (status === "inactive") {
    subject = `⚠️ Important Notice: Account Deactivated`;
    heading = "Account Temporarily Deactivated";
    messageText = `Please be notified that your OyaEat platform operator permissions for this account have been deactivated by administration compliance. If you believe this is an error or need clarification, please contact our support team.`;
    buttonLabel = "Contact Support";
  } 
  else {
    subject = "OyaEat Profile Status Update";
    heading = "Profile Update Notice";
    messageText = `Your account tracking profile status has been changed to: ${status}.`;
    buttonLabel = "Launch Portal";
  }

  // High-utility transactional responsive email template
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #F5FAF6; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
              <tr style="background-color: #1B4332;">
                <td align="center" style="padding: 30px 20px;">
                  <h1 style="margin: 0; color: #FFFFFF; font-size: 24px; font-weight: 900; letter-spacing: -0.03em;">Oya<span style="color: #4ade80;">Eat</span></h1>
                  <p style="margin: 4px 0 0 0; color: #A5D6A7; font-size: 10px; font-weight: bold; letter-spacing: 0.15em; text-transform: uppercase;">${portalName}</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 30px 24px;">
                  <p style="margin: 0 0 16px 0; font-size: 15px; color: #1E293B; font-weight: bold;">Hello ${firstName},</p>
                  <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #1B4332; font-weight: 800;">${heading}</h2>
                  <p style="margin: 0 0 24px 0; font-size: 13px; color: #475569; line-height: 1.6;">${messageText}</p>
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td align="center" style="padding-bottom: 12px;">
                        <a href="${buttonUrl}" target="_blank" style="display: inline-block; background-color: #1B4332; color: #FFFFFF; font-size: 12px; font-weight: bold; text-decoration: none; text-transform: uppercase; letter-spacing: 0.05em; padding: 12px 28px; border-radius: 6px;">
                          ${buttonLabel}
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding: 20px 24px; background-color: #F8FAFC; border-top: 1px solid #F1F5F9;">
                  <p style="margin: 0; font-size: 11px; color: #94A3B8;">&copy; ${new Date().getFullYear()} OyaEat Logistical Systems. All rights reserved.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  return { subject, html };
};

/**
 * Universal dynamic status notification service engine
 */
exports.sendStatusNotificationEmail = async (email, firstName, status, userRole) => {
  try {
    const { subject, html } = getStatusEmailTemplate(firstName, status, userRole);

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: subject,
      html: html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 [${userRole.toUpperCase()}] Notification Email fired to ${email}. MessageId: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error("❌ Failed executing transactional Nodemailer dispatch process:", error);
    return false;
  }
};
