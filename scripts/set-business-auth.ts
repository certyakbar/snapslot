import { randomBytes } from "crypto";
import { hashPassword } from "../auth.ts";
import { BookingStore } from "../bookingStore.ts";

type CliArgs = {
  businessIdOrSlug: string;
  ownerName: string;
  ownerEmail: string;
  password: string;
};

function getArgValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);

  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function parseArgs(): CliArgs {
  const businessIdOrSlug =
    getArgValue("--business") ?? getArgValue("--business-id") ?? getArgValue("--slug");
  const ownerName = getArgValue("--owner-name");
  const ownerEmail = getArgValue("--owner-email");
  const password = getArgValue("--password");

  if (!businessIdOrSlug || !ownerName || !ownerEmail || !password) {
    throw new Error(
      "Usage: node --loader ts-node/esm scripts/set-business-auth.ts --business <id-or-slug> --owner-name <name> --owner-email <email> --password <password>"
    );
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  return {
    businessIdOrSlug,
    ownerName,
    ownerEmail,
    password,
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const store = await BookingStore.create();
  const before = store.listAuthIncompleteBusinesses();
  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = hashPassword(args.password, passwordSalt);

  const updatedBusiness = await store.updateBusinessAuth({
    businessIdOrSlug: args.businessIdOrSlug,
    ownerName: args.ownerName,
    ownerEmail: args.ownerEmail,
    passwordHash,
    passwordSalt,
  });

  const after = store.listAuthIncompleteBusinesses();

  console.log(
    `Updated auth for ${updatedBusiness.id} (${updatedBusiness.bookingPageSlug}). Auth-incomplete businesses: ${before.length} -> ${after.length}.`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error.";
  console.error(message);
  process.exit(1);
});
