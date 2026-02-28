const prisma = require("../lib/prisma");
const bcrypt = require("bcrypt");

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const phone = process.env.ADMIN_PHONE || "5550000000";
  const firstName = process.env.ADMIN_FIRST_NAME || "Admin";
  const lastName = process.env.ADMIN_LAST_NAME || "User";

  if (!email || !password) {
    console.error("Missing ADMIN_EMAIL or ADMIN_PASSWORD in environment.");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const isAdmin = existing.role === "admin";
    console.log(`User exists with id=${existing.id}, role=${existing.role}`);
    if (!isAdmin) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: "admin", phoneVerified: true },
      });
      console.log("Updated role to admin and set phoneVerified=true");
    } else {
      console.log("Role already admin, no changes");
    }
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      firstName,
      lastName,
      email,
      phone,
      password: hash,
      role: "admin",
      phoneVerified: true,
    },
  });
  console.log(`Admin created with id=${user.id}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
