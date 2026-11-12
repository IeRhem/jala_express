import "dotenv/config";
import { db } from "@/prisma/db";

/**
 * Idempotent Day-1 Seed Script for SafeDrop Taraba 45-Day Pilot.
 * Seeds ServiceAreas (Jalingo, Wukari, Takum), Categories (Food, Electronics, Rides),
 * and Staff Roles (Admin, Ops, Rider), plus sample pilot records so the dashboard works immediately.
 *
 * Run via: npx tsx prisma/seed.ts
 */
async function seed() {
  console.log("🌱 Seeding SafeDrop Taraba Pilot lookup tables...");

  // 1. Seed Taraba Service Areas
  const towns = ["Jalingo", "Wukari", "Takum"];
  const areaMap: Record<string, any> = {};

  for (const name of towns) {
    let area = await db.orm.public.ServiceArea.where({ name }).first();
    if (!area) {
      area = await db.orm.public.ServiceArea.create({
        name,
        state: "Taraba",
        active: true,
      });
      console.log(`  ✔ Created ServiceArea: ${name}`);
    }
    areaMap[name] = area;
  }

  // 2. Seed Pilot Categories
  const categories = [
    { name: "Food & Market Goods", slug: "food" },
    { name: "Phones & Electronics", slug: "electronics" },
    { name: "Local Rides & Delivery", slug: "rides" },
  ];
  const categoryMap: Record<string, any> = {};

  for (const cat of categories) {
    let existing = await db.orm.public.Category.where({ slug: cat.slug }).first();
    if (!existing) {
      existing = await db.orm.public.Category.create({
        name: cat.name,
        slug: cat.slug,
        active: true,
      });
      console.log(`  ✔ Created Category: ${cat.name}`);
    }
    categoryMap[cat.slug] = existing;
  }

  // 3. Seed Staff Roles
  const roles = [
    { name: "Admin", slug: "admin" },
    { name: "Ops", slug: "ops" },
    { name: "Rider", slug: "rider" },
  ];
  const roleMap: Record<string, any> = {};

  for (const r of roles) {
    let existing = await db.orm.public.Role.where({ slug: r.slug }).first();
    if (!existing) {
      existing = await db.orm.public.Role.create({
        name: r.name,
        slug: r.slug,
        active: true,
      });
      console.log(`  ✔ Created Role: ${r.name}`);
    }
    roleMap[r.slug] = existing;
  }

  // 4. Seed 3 Pilot Riders + 1 Ops Admin if none exist
  const initialStaff = [
    { name: "Rhema Joseph (Ops Admin)", phone: "2348000000001", roleSlug: "admin" },
    { name: "Musa Danjuma (Jalingo Rider)", phone: "2348000000002", roleSlug: "rider" },
    { name: "Tersoo Agbu (Wukari Rider)", phone: "2348000000003", roleSlug: "rider" },
    { name: "Ibrahim Audu (Takum Rider)", phone: "2348000000004", roleSlug: "rider" },
  ];

  for (const s of initialStaff) {
    const existing = await db.orm.public.Staff.where({ phone: s.phone }).first();
    if (!existing && roleMap[s.roleSlug]) {
      await db.orm.public.Staff.create({
        name: s.name,
        phone: s.phone,
        roleId: roleMap[s.roleSlug].id,
        active: true,
      });
      console.log(`  ✔ Created Staff: ${s.name}`);
    }
  }

  // 5. Seed Sample Pilot Vendors if none exist
  const existingVendors = await db.orm.public.Vendor.where({ active: true }).all();
  if (existingVendors.length === 0) {
    const sampleVendors = [
      {
        businessName: "Jalingo Central Gadgets",
        phone: "2348011112222",
        areaName: "Jalingo",
        categorySlug: "electronics",
        payoutRecipientRef: "RCP_mock_jalingo_gadgets",
        bankName: "Guaranty Trust Bank",
        accountNumber: "0123456789",
      },
      {
        businessName: "Wukari Kilishi & Grill Spot",
        phone: "2348033334444",
        areaName: "Wukari",
        categorySlug: "food",
        payoutRecipientRef: "RCP_mock_wukari_grill",
        bankName: "Access Bank",
        accountNumber: "0987654321",
      },
      {
        businessName: "Takum Market Hub",
        phone: "2348055556666",
        areaName: "Takum",
        categorySlug: "food",
        payoutRecipientRef: "RCP_mock_takum_hub",
        bankName: "First Bank of Nigeria",
        accountNumber: "2034567890",
      },
    ];

    for (const v of sampleVendors) {
      const area = areaMap[v.areaName];
      const cat = categoryMap[v.categorySlug];
      if (!area || !cat) continue;

      const vendor = await db.orm.public.Vendor.create({
        businessName: v.businessName,
        areaId: area.id,
        phone: v.phone,
        payoutProvider: "PAYSTACK",
        payoutRecipientRef: v.payoutRecipientRef,
        bankName: v.bankName,
        accountNumber: v.accountNumber,
        active: true,
      });

      await db.orm.public.VendorCategory.create({
        vendorId: vendor.id,
        categoryId: cat.id,
        active: true,
      });
      console.log(`  ✔ Created Sample Vendor: ${v.businessName} (${v.areaName})`);
    }
  }

  console.log("✅ SafeDrop Taraba Pilot seed complete!");
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
