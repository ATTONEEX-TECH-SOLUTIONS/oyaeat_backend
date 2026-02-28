const prisma = require("../src/lib/prisma"); // same as your controllers
const bcrypt = require("bcrypt");

async function main() {
  const email = "admin@oya-eat.com";
  const phone = "+2348000000000"; // must be UNIQUE
  const password = "Admin@123456"; // change after first login

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { phone }] },
  });

  if (existing) {
    console.log("✅ Admin already exists (or email/phone already used):", {
      id: existing.id,
      email: existing.email,
      phone: existing.phone,
      role: existing.role,
    });
    console.log("If this user is not admin, update its role manually.");
    return;
  }

  const hashed = await bcrypt.hash(password, 10);

  const admin = await prisma.user.create({
    data: {
      firstName: "Super",
      lastName: "Admin",
      email,
      phone,
      password: hashed,
      role: "admin", // ✅ this makes it admin
      phoneVerified: true,
    },
  });

  console.log("✅ Admin created:", {
    id: admin.id,
    email: admin.email,
    phone: admin.phone,
    role: admin.role,
  });
  console.log("Login with:", { email, password });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });