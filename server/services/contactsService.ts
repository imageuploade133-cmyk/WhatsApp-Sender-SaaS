import xlsx from 'xlsx';
import { Readable } from 'stream';
import csvParser from 'csv-parser';

export interface Contact {
  id: string;
  name: string;
  phoneNumber: string;
  createdAt: string;
}

class ContactsService {
  private contacts: Contact[] = [];

  public getContacts(): Contact[] {
    return this.contacts;
  }

  public addContacts(rawContacts: { name?: string; phoneNumber: string }[]): Contact[] {
    const added: Contact[] = [];

    for (const raw of rawContacts) {
      // Clean phone number (strip spaces, symbols, keep digits)
      const cleanedPhone = raw.phoneNumber.replace(/\D/g, '');
      if (!cleanedPhone) continue;

      // Avoid exact duplicate phone numbers
      const exists = this.contacts.some((c) => c.phoneNumber === cleanedPhone);
      if (exists) continue;

      const newContact: Contact = {
        id: Math.random().toString(36).substring(2, 9),
        name: raw.name?.trim() || `Contact ${cleanedPhone.slice(-4)}`,
        phoneNumber: cleanedPhone,
        createdAt: new Date().toISOString(),
      };

      this.contacts.push(newContact);
      added.push(newContact);
    }

    // Sort contacts: newly added first
    this.contacts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return added;
  }

  public searchContacts(query: string): Contact[] {
    const lower = query.toLowerCase();
    return this.contacts.filter(
      (c) => c.name.toLowerCase().includes(lower) || c.phoneNumber.includes(lower)
    );
  }

  public clearContacts(): void {
    this.contacts = [];
  }

  public async parseCsvBuffer(buffer: Buffer): Promise<{ name?: string; phoneNumber: string }[]> {
    return new Promise((resolve, reject) => {
      const results: { name?: string; phoneNumber: string }[] = [];
      const stream = Readable.from(buffer);

      stream
        .pipe(csvParser())
        .on('data', (row: any) => {
          const keys = Object.keys(row);
          // Match headers like 'Phone', 'PhoneNumber', 'Mobile', 'Tel', 'Contact'
          const phoneKey = keys.find((k) => /phone|number|cel|tel|contact/i.test(k));
          const nameKey = keys.find((k) => /name|nome|user|client|contact_name/i.test(k));

          const phoneNumber = phoneKey ? String(row[phoneKey]).trim() : '';
          const name = nameKey ? String(row[nameKey]).trim() : undefined;

          // If no matching headers are found, but we have columns, assume first col is name, second col is phone (or vice versa)
          if (!phoneKey && keys.length > 0) {
            // Let's try to find any column with digits
            const guessedPhoneKey = keys.find((k) => /^[+\d\s()-]+$/.test(String(row[k]).trim()));
            if (guessedPhoneKey) {
              const guessedNameKey = keys.find((k) => k !== guessedPhoneKey);
              results.push({
                name: guessedNameKey ? String(row[guessedNameKey]).trim() : undefined,
                phoneNumber: String(row[guessedPhoneKey]).trim(),
              });
              return;
            }
          }

          if (phoneNumber) {
            results.push({ name, phoneNumber });
          }
        })
        .on('end', () => {
          resolve(results);
        })
        .on('error', (err) => {
          reject(err);
        });
    });
  }

  public parseXlsxBuffer(buffer: Buffer): { name?: string; phoneNumber: string }[] {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json<any>(sheet);

    const results: { name?: string; phoneNumber: string }[] = [];
    for (const row of rows) {
      const keys = Object.keys(row);
      const phoneKey = keys.find((k) => /phone|number|cel|tel|contact/i.test(k));
      const nameKey = keys.find((k) => /name|nome|user|client|contact_name/i.test(k));

      let phoneNumber = phoneKey ? String(row[phoneKey]).trim() : '';
      let name = nameKey ? String(row[nameKey]).trim() : undefined;

      if (!phoneKey && keys.length > 0) {
        // Fallback guess
        const guessedPhoneKey = keys.find((k) => /^[+\d\s()-]+$/.test(String(row[k]).trim()));
        if (guessedPhoneKey) {
          phoneNumber = String(row[guessedPhoneKey]).trim();
          const guessedNameKey = keys.find((k) => k !== guessedPhoneKey);
          name = guessedNameKey ? String(row[guessedNameKey]).trim() : undefined;
        }
      }

      if (phoneNumber) {
        results.push({ name, phoneNumber });
      }
    }
    return results;
  }
}

export const contactsService = new ContactsService();
