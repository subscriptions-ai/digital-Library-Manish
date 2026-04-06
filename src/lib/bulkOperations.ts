export async function processCSV(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const rows = text.split('\n').filter(row => row.trim());
        const data = rows.map(row => {
          const [name, email, password] = row.split(',').map(s => s.trim());
          return { name, email, password };
        });
        
        const response = await fetch('/api/institution/students/bulk', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ students: data })
        });
        
        if (!response.ok) throw new Error("Bulk import failed");
        const result = await response.json();
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsText(file);
  });
}
