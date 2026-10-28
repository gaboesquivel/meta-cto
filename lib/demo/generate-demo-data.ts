import { faker } from "@faker-js/faker";
import { z } from "zod";

const REFERENCE_DATE = new Date("2026-01-15T12:00:00.000Z");

const schemaIdSchema = z.enum(["users", "support_tickets", "orders"]);

export const generateDemoDataInputSchema = z.object({
  locale: z.string().min(2).max(10).optional(),
  rows: z.number().int().min(1).max(10).default(5),
  schema: schemaIdSchema,
  seed: z.number().int().min(0).max(999_999).default(42),
});

export type GenerateDemoDataInput = z.infer<typeof generateDemoDataInputSchema>;

const buildUsers = ({ rows, seed }: { rows: number; seed: number }) => {
  faker.seed(seed);
  faker.setDefaultRefDate(REFERENCE_DATE);
  return Array.from({ length: rows }, (_, index) => {
    const id = `user_${seed}_${index}`;
    return {
      department: faker.commerce.department(),
      email: faker.internet.email({ firstName: `user${index}` }),
      id,
      name: faker.person.fullName(),
      role: faker.helpers.arrayElement(["viewer", "editor", "admin"]),
    };
  });
};

const buildSupportTickets = ({ rows, seed }: { rows: number; seed: number }) => {
  faker.seed(seed + 1);
  faker.setDefaultRefDate(REFERENCE_DATE);
  const users = buildUsers({ rows: Math.min(rows, 5), seed });
  return Array.from({ length: rows }, (_, index) => ({
    assigneeId: users[index % users.length]?.id ?? `user_${seed}_0`,
    id: `ticket_${seed}_${index}`,
    priority: faker.helpers.arrayElement(["low", "medium", "high"]),
    status: faker.helpers.arrayElement(["open", "pending", "resolved"]),
    subject: faker.lorem.sentence({ max: 8, min: 4 }),
  }));
};

const buildOrders = ({ rows, seed }: { rows: number; seed: number }) => {
  faker.seed(seed + 2);
  faker.setDefaultRefDate(REFERENCE_DATE);
  const users = buildUsers({ rows: Math.min(rows, 5), seed });
  return Array.from({ length: rows }, (_, index) => ({
    amountUsd: faker.number.float({ fractionDigits: 2, max: 500, min: 12 }),
    customerId: users[index % users.length]?.id ?? `user_${seed}_0`,
    id: `order_${seed}_${index}`,
    placedAt: faker.date.recent({ days: 14, refDate: REFERENCE_DATE }).toISOString(),
    status: faker.helpers.arrayElement(["processing", "shipped", "delivered"]),
  }));
};

export const generateDemoData = (input: GenerateDemoDataInput) => {
  const parsed = generateDemoDataInputSchema.parse(input);
  const { rows, schema, seed } = parsed;
  const data = (() => {
    if (schema === "users") return buildUsers({ rows, seed });
    if (schema === "support_tickets") return buildSupportTickets({ rows, seed });
    return buildOrders({ rows, seed });
  })();

  return {
    records: data,
    referenceDate: REFERENCE_DATE.toISOString(),
    rows: data.length,
    schema,
    seed,
  };
};
