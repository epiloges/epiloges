import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createAcsCourierProvider, todayInAthens } from "@/lib/courier/providers/acs";

/**
 * The test cycle ACS asks for before activating an account: one voucher, printed both
 * ways, and the day's pickup list — as PDFs to email back to them.
 *
 *   npm run acs:test                 # voucher → print (A4 + thermal) → pickup list → print
 *   npm run acs:test -- --date 2026-09-14
 *   npm run acs:test -- --delete 7227889174   # cancel a voucher that is not on a list yet
 *
 * Calls `createAcsCourierProvider` directly with the ACS_* values in `.env`, bypassing
 * `COURIER_PROVIDER`, so the live shop is untouched and no order is modified — the voucher
 * goes to the shop's own address with a made-up reference. Output lands in `./acs-test/`.
 *
 * ACS's pickup date must be a working day (not Sunday or a public holiday) and not in the
 * past; the default is today in Athens. The pickup list closes EVERY printed voucher on the
 * account for that date, which on a test account is exactly the point.
 *
 * Needs `--conditions=react-server` (see package.json) because the provider imports
 * `server-only`.
 */

const args = process.argv.slice(2);
const flag = (name: string) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in .env`);
  return value;
}

async function main() {
  const provider = createAcsCourierProvider({
    apiKey: required("ACS_API_KEY"),
    companyId: required("ACS_COMPANY_ID"),
    companyPassword: required("ACS_COMPANY_PASSWORD"),
    userId: required("ACS_USER_ID"),
    userPassword: required("ACS_USER_PASSWORD"),
    billingCode: required("ACS_BILLING_CODE"),
  });

  const toDelete = flag("--delete");
  if (toDelete) {
    await provider.deleteShipment!(toDelete);
    console.log(`Deleted voucher ${toDelete}.`);
    return;
  }

  const date = flag("--date") ?? todayInAthens();
  const outDir = join(process.cwd(), "acs-test");
  mkdirSync(outDir, { recursive: true });
  const save = (name: string, bytes: Uint8Array) => {
    const path = join(outDir, name);
    writeFileSync(path, bytes);
    console.log(`  saved ${path} (${bytes.length} bytes)`);
  };

  console.log(`1/4  Creating a test voucher for pickup on ${date}…`);
  const shipment = await provider.createShipment({
    orderId: `TEST-${Date.now()}`,
    recipientName: "ΔΟΚΙΜΑΣΤΙΚΟΣ ΠΑΡΑΛΗΠΤΗΣ",
    address: {
      firstName: "ΔΟΚΙΜΑΣΤΙΚΟΣ",
      lastName: "ΠΑΡΑΛΗΠΤΗΣ",
      company: "ALEXANDRIS SHOES",
      address1: "Έβανς 9",
      city: "Ηράκλειο",
      region: "Κρήτη",
      postalCode: "71201",
      countryCode: "GR",
      phone: "6900000000",
    },
    weightGrams: 1000,
    itemQuantity: 1,
    codAmount: 83.05,
    deliveryNotes: "ΔΟΚΙΜΗ WEB SERVICES — ΜΗΝ ΑΠΟΣΤΑΛΕΙ",
    senderName: "ALEXANDRIS",
  });
  console.log(`  voucher ${shipment.trackingNumber}`);

  console.log("2/4  Printing it — laser A4 and thermal…");
  save(`voucher-${shipment.trackingNumber}-laser.pdf`, await provider.printLabels!([shipment.trackingNumber], "laser"));
  save(`voucher-${shipment.trackingNumber}-thermal.pdf`, await provider.printLabels!([shipment.trackingNumber], "thermal"));

  console.log(`3/4  Issuing the pickup list for ${date}…`);
  const list = await provider.issuePickupList!(date);
  if (!list.pickupListNo) {
    console.log(`  ACS refused: unprinted vouchers ${list.unprintedVouchers.join(", ")}`);
    return;
  }
  console.log(`  pickup list ${list.pickupListNo}`);

  console.log("4/4  Printing the pickup list…");
  save(`pickup-list-${list.pickupListNo}.pdf`, await provider.printPickupList!(list.pickupListNo, date));

  console.log("\nDone. Email the two voucher PDFs (whichever matches your printer) and the pickup list PDF to ACS.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
