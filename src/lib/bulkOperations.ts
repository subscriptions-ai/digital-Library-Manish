import Papa from 'papaparse';
import { collection, addDoc, serverTimestamp, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, UserRole } from '../types';

export const bulkImportUsers = async (csvFile: File, institutionId?: string) => {
  return new Promise((resolve, reject) => {
    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const batch = writeBatch(db);
          const users = results.data as any[];

          for (const user of users) {
            const userRef = doc(collection(db, 'users'));
            batch.set(userRef, {
              email: user.email,
              displayName: user.name,
              role: (user.role as UserRole) || 'Student',
              institutionId: institutionId || user.institutionId || null,
              status: 'Active',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }

          await batch.commit();
          resolve(users.length);
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => reject(error)
    });
  });
};

export const bulkExportToCSV = (data: any[], filename: string) => {
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const getBulkUserTemplate = () => {
  const template = [
    { name: 'John Doe', email: 'john@example.com', role: 'Student' },
    { name: 'Jane Smith', email: 'jane@university.edu', role: 'Student' }
  ];
  bulkExportToCSV(template, 'user_import_template');
};
