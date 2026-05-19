const prisma = require("../src/lib/prisma");
const bcrypt = require("bcrypt");

async function main() {
  const email = "admin@example.com";
  const phone = "+2348000000000";
  const password = "Admin@123456";

  // Delete old admin completely
  await prisma.user.deleteMany({
    where: { email },
  });

  // Hash fresh password
  const hashed = await bcrypt.hash(password, 10);

  console.log("NEW HASH:", hashed);

  // Create new admin
  const admin = await prisma.user.create({
    data: {
      firstName: "Super",
      lastName: "Admin",
      email,
      phone,
      password: hashed,
      role: "admin",
      phoneVerified: true,
    },
  });

  console.log("ADMIN READY:", {
    email: admin.email,
    password,
  });
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });