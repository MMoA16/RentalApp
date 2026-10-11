const fs = require('fs');
const currentMonthValue = '2026-09';

const sampleProperties = Array.from({ length: 30 }, (_, index) => ({
  id: String(index + 1),
  name: `House ${index + 1}`,
  recordMonth: currentMonthValue,
  tenantName: `Tenant ${index + 1}`,
  tenantPhone: `+91 90000 ${String(index + 100).padStart(4, '0')}`,
  monthlyRent: 800 + index * 10,
  paidAmount: index % 3 === 0 ? 800 + index * 10 : (index % 2 === 0 ? 500 : 0),
  deposit: 1500,
  balance: index % 4 === 0 ? 2000 : 0,
  currentBill: index % 3 === 0 ? 300 : 0,
  waterBill: index % 2 === 0 ? 180 : 0,
}));

const outFile = 'backup-local-sample-properties-2026-09-27.json';
fs.writeFileSync(outFile, JSON.stringify(sampleProperties, null, 2), 'utf8');
console.log('Backup written to', outFile);
