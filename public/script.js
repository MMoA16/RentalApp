const STORAGE_KEY = 'rental-monthly-ledger-v1';
const MASTER_KEY = 'rental-property-master-v1';
const CF_API = 'https://rental-manager-worker.marutiarer16.workers.dev/api/properties';

const currentMonth = new Date();
const ledgerStartMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 2, 1);
const currentMonthValue = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;

const state = {
  propertyMasters: [],
  monthlyRecords: [],
  editingRecordId: null,
  editingMasterId: null,
  selectedPropertyId: null,
};

const propertyTableBody = document.getElementById('propertyTableBody');
const formSection = document.getElementById('formSection');
const propertyForm = document.getElementById('propertyForm');
const formTitle = document.getElementById('formTitle');
const addPropertyBtn = document.getElementById('addPropertyBtn');
const cancelBtn = document.getElementById('cancelBtn');
const tenantSection = document.getElementById('tenantSection');
const tenantForm = document.getElementById('tenantForm');
const tenantCancelBtn = document.getElementById('tenantCancelBtn');
const monthSelector = document.getElementById('monthSelector');
const pdfBtn = document.getElementById('pdfBtn');

function getMonthOptions() {
  const months = [];
  for (let i = 0; i < 13; i += 1) {
    const date = new Date(ledgerStartMonth.getFullYear(), ledgerStartMonth.getMonth() + i, 1);
    months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

function getMonthLabel(monthValue) {
  if (!monthValue) return 'Current Month';
  const [year, month] = monthValue.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function getCurrentMonthValue() {
  if (!monthSelector.value) {
    monthSelector.value = currentMonthValue;
  }
  const label = document.getElementById('monthLabel');
  if (label) {
    label.textContent = getMonthLabel(monthSelector.value || currentMonthValue);
  }
  return monthSelector.value;
}

function isUpcomingMonth(monthValue) {
  if (!monthValue) return false;
  const [year, month] = monthValue.split('-').map(Number);
  const targetKey = year * 12 + month;
  const currentKey = currentMonth.getFullYear() * 12 + (currentMonth.getMonth() + 1);
  return targetKey > currentKey;
}

function findPropertyMaster(propertyId) {
  return state.propertyMasters.find((master) => String(master.id) === String(propertyId)) || null;
}

function rebuildMastersFromRecords() {
  const masterMap = new Map();

  state.monthlyRecords.forEach((record) => {
    const id = String(record.propertyId || '');
    if (!id) return;

    const existing = masterMap.get(id) || {
      id,
      name: record.name || `House ${id}`,
      tenantName: record.tenantName || '',
      tenantPhone: record.tenantPhone || '',
      monthlyRent: Number(record.monthlyRent || 0),
      deposit: Number(record.deposit || 0),
    };

    existing.name = record.name || existing.name || `House ${id}`;
    existing.tenantName = record.tenantName || existing.tenantName || '';
    existing.tenantPhone = record.tenantPhone || existing.tenantPhone || '';
    existing.monthlyRent = Number(record.monthlyRent || existing.monthlyRent || 0);
    existing.deposit = Number(record.deposit || existing.deposit || 0);
    masterMap.set(id, existing);
  });

  state.propertyMasters = Array.from(masterMap.values()).sort((a, b) => Number(a.id) - Number(b.id));
  localStorage.setItem(MASTER_KEY, JSON.stringify(state.propertyMasters));
}

function buildPropertyMasters() {
  return Array.from({ length: 30 }, (_, index) => ({
    id: String(index + 1),
    name: `House ${index + 1}`,
    tenantName: `Tenant ${index + 1}`,
    tenantPhone: `+91 90000 ${String(index + 100).padStart(4, '0')}`,
    monthlyRent: 800 + index * 10,
    deposit: 1500,
  }));
}

function buildMonthlyLedger(masters) {
  const months = getMonthOptions();
  const records = [];

  masters.forEach((master) => {
    months.forEach((month) => {
      const samePropertyRecords = records.filter((record) => String(record.propertyId) === String(master.id) && record.recordMonth < month);
      const previousOutstanding = samePropertyRecords.length
        ? Number(samePropertyRecords[samePropertyRecords.length - 1].balance || 0)
        : 0;

      records.push({
        id: `${master.id}-${month}`,
        propertyId: String(master.id),
        recordMonth: month,
        name: master.name,
        tenantName: master.tenantName,
        tenantPhone: master.tenantPhone,
        monthlyRent: Number(master.monthlyRent || 0),
        paidAmount: 0,
        deposit: Number(master.deposit || 0),
        currentBill: 0,
        waterBill: 0,
        notes: '',
        balance: previousOutstanding + Number(master.monthlyRent || 0),
      });
    });
  });

  return records;
}

function ensureMissingMonthlyRecords() {
  const months = getMonthOptions();
  const existingByKey = new Map(
    state.monthlyRecords.map((record) => [`${String(record.propertyId)}-${record.recordMonth}`, record])
  );
  const missingRecords = [];

  state.propertyMasters.forEach((master) => {
    months.forEach((month) => {
      const key = `${String(master.id)}-${month}`;
      if (existingByKey.has(key)) {
        return;
      }

      const previousOutstanding = getPreviousOutstanding(master.id, month);
      missingRecords.push({
        id: key,
        propertyId: String(master.id),
        recordMonth: month,
        name: master.name || `House ${master.id}`,
        tenantName: master.tenantName || '',
        tenantPhone: master.tenantPhone || '',
        monthlyRent: Number(master.monthlyRent || 0),
        paidAmount: 0,
        deposit: Number(master.deposit || 0),
        currentBill: 0,
        waterBill: 0,
        notes: '',
        balance: previousOutstanding + Number(master.monthlyRent || 0),
      });
    });
  });

  if (missingRecords.length) {
    state.monthlyRecords = [...state.monthlyRecords, ...missingRecords];
  }
}

function getPreviousOutstanding(propertyId, monthValue) {
  const previousRecords = state.monthlyRecords
    .filter((record) => String(record.propertyId) === String(propertyId) && record.recordMonth < monthValue)
    .sort((a, b) => a.recordMonth.localeCompare(b.recordMonth));

  if (!previousRecords.length) {
    return 0;
  }

  return Number(previousRecords[previousRecords.length - 1].balance || 0);
}

function sanitizeRecordId(value) {
  return String(value || '').replace(/^['"]+|['"]+$/g, '');
}

function normalizeRecord(record) {
  const propertyId = String(record.propertyId || '');
  const monthValue = record.recordMonth || currentMonthValue;
  const monthlyRent = Number(record.monthlyRent || 0);
  const paidAmount = Number(record.paidAmount || 0);
  const previousOutstanding = getPreviousOutstanding(propertyId, monthValue);
  const computedBalance = previousOutstanding + monthlyRent + Number(record.currentBill || 0) + Number(record.waterBill || 0) - paidAmount;

  return {
    ...record,
    propertyId,
    id: sanitizeRecordId(record.id || `${propertyId}-${monthValue}`),
    monthlyRent,
    paidAmount,
    deposit: Number(record.deposit || 0),
    currentBill: Number(record.currentBill || 0),
    waterBill: Number(record.waterBill || 0),
    notes: record.notes || '',
    balance: computedBalance,
  };
}

function saveMasters() {
  localStorage.setItem(MASTER_KEY, JSON.stringify(state.propertyMasters));
}

function saveMonthlyRecords() {
  const normalized = state.monthlyRecords.map(normalizeRecord);
  state.monthlyRecords = normalized;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));

  fetch(CF_API, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalized),
  }).catch((error) => {
    console.warn('Cloud sync skipped:', error.message);
  });
}

function seedData() {
  state.propertyMasters = buildPropertyMasters();
  state.monthlyRecords = buildMonthlyLedger(state.propertyMasters);
  saveMasters();
  saveMonthlyRecords();
}

function readData() {
  try {
    const storedMasters = localStorage.getItem(MASTER_KEY);
    const storedRecords = localStorage.getItem(STORAGE_KEY);

    if (storedMasters && storedRecords) {
      const masters = JSON.parse(storedMasters);
      const records = JSON.parse(storedRecords);
      if (Array.isArray(masters) && masters.length && Array.isArray(records) && records.length) {
        state.propertyMasters = masters;
        state.monthlyRecords = records.map(normalizeRecord);
        ensureMissingMonthlyRecords();
        return;
      }
    }
  } catch (error) {
    console.warn('Stored data read failed, reseeding.', error);
  }

  state.propertyMasters = buildPropertyMasters();
  state.monthlyRecords = buildMonthlyLedger(state.propertyMasters);
  ensureMissingMonthlyRecords();
}

function getPropertiesForSelectedMonth() {
  const selectedMonth = getCurrentMonthValue();
  return state.monthlyRecords
    .filter((record) => record.recordMonth === selectedMonth)
    .map((record) => {
      const master = findPropertyMaster(record.propertyId);
      return {
        ...record,
        name: master?.name || record.name || 'House',
        tenantName: master?.tenantName || record.tenantName || '',
        tenantPhone: master?.tenantPhone || record.tenantPhone || '',
      };
    });
}

function formatCurrency(value) {
  const numericValue = Number(value) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(numericValue);
}

function updateStats() {
  const visibleProperties = getPropertiesForSelectedMonth();
  const totalRent = visibleProperties.reduce((sum, item) => sum + Number(item.monthlyRent || 0), 0);
  const totalPaid = visibleProperties.reduce((sum, item) => sum + Number(item.paidAmount || 0), 0);
  const totalDeposit = visibleProperties.reduce((sum, item) => sum + Number(item.deposit || 0), 0);
  const totalBalance = visibleProperties.reduce((sum, item) => sum + Number(item.balance || 0), 0);
  const totalBills = visibleProperties.reduce((sum, item) => sum + Number(item.currentBill || 0) + Number(item.waterBill || 0), 0);

  document.getElementById('totalRent').textContent = formatCurrency(totalRent);
  document.getElementById('totalPaid').textContent = formatCurrency(totalPaid);
  document.getElementById('totalDeposit').textContent = formatCurrency(totalDeposit);
  document.getElementById('totalBalance').textContent = formatCurrency(totalBalance);
  document.getElementById('totalBills').textContent = formatCurrency(totalBills);
}

function getMonthlySummary() {
  const monthValue = getCurrentMonthValue();
  const reportMonthLabel = getMonthLabel(monthValue);
  const visibleProperties = getPropertiesForSelectedMonth();

  const monthlyIncome = visibleProperties.reduce((sum, item) => sum + Number(item.paidAmount || 0), 0);
  const monthlyUtilities = visibleProperties.reduce((sum, item) => sum + Number(item.currentBill || 0) + Number(item.waterBill || 0), 0);
  const monthlyOutstanding = visibleProperties.reduce((sum, item) => sum + Number(item.balance || 0), 0);

  document.getElementById('reportTitle').textContent = `Monthly Report - ${reportMonthLabel}`;
  document.getElementById('monthlyIncome').textContent = formatCurrency(monthlyIncome);
  document.getElementById('monthlyUtilities').textContent = formatCurrency(monthlyUtilities);
  document.getElementById('monthlyOutstanding').textContent = formatCurrency(monthlyOutstanding);
}

function deleteProperty(propertyId) {
  const id = String(propertyId);
  if (!id) {
    return;
  }

  const confirmed = window.confirm('Delete this property and all its monthly records?');
  if (!confirmed) {
    return;
  }

  state.propertyMasters = state.propertyMasters.filter((master) => String(master.id) !== id);
  state.monthlyRecords = state.monthlyRecords.filter((record) => String(record.propertyId) !== id);

  if (state.selectedPropertyId === id) {
    state.selectedPropertyId = null;
  }

  saveMasters();
  saveMonthlyRecords();
  render();
}

function renderTable() {
  const visibleProperties = getPropertiesForSelectedMonth();

  propertyTableBody.innerHTML = visibleProperties
    .map(
      (property) => `
        <tr data-property-id="${property.propertyId}" class="${state.selectedPropertyId === String(property.propertyId) ? 'selected' : ''}">
          <td>${property.name}</td>
          <td>${property.tenantName || 'N/A'}</td>
          <td>${property.tenantPhone || 'N/A'}</td>
          <td>${formatCurrency(property.monthlyRent)}</td>
          <td>${formatCurrency(property.paidAmount || 0)}</td>
          <td>${formatCurrency(property.deposit)}</td>
          <td>${formatCurrency(property.balance || 0)}</td>
          <td>${formatCurrency(property.currentBill)}</td>
          <td>${formatCurrency(property.waterBill)}</td>
          <td>${(property.notes || '').replace(/[<>]/g, '').slice(0, 40) || '—'}</td>
          <td>
            <div class="actions">
              <button class="icon-btn edit-btn" data-id="${property.id}">Edit</button>
              <button class="icon-btn delete-btn" data-id="${property.id}">Delete</button>
            </div>
          </td>
        </tr>
      `
    )
    .join('');
}

function resetForm() {
  propertyForm.reset();
  document.getElementById('recordMonth').value = getCurrentMonthValue();
  document.getElementById('paidAmount').value = 0;
  document.getElementById('balance').value = 0;
  document.getElementById('currentBill').value = 0;
  document.getElementById('waterBill').value = 0;
  document.getElementById('notes').value = '';
  document.getElementById('name').readOnly = false;
  document.getElementById('tenantName').readOnly = false;
  document.getElementById('tenantPhone').readOnly = false;
  document.getElementById('monthlyRent').readOnly = false;
  document.getElementById('deposit').readOnly = false;
  state.editingRecordId = null;
  formTitle.textContent = 'Monthly Payment Update';
  formSection.classList.add('hidden');
}

function openMonthlyFormForEdit(record) {
  const master = findPropertyMaster(record.propertyId);
  state.editingRecordId = record.id;
  formTitle.textContent = 'Monthly Payment Update';

  document.getElementById('name').readOnly = false;
  document.getElementById('tenantName').readOnly = false;
  document.getElementById('tenantPhone').readOnly = false;
  document.getElementById('monthlyRent').readOnly = false;
  document.getElementById('deposit').readOnly = false;

  document.getElementById('name').value = master?.name || record.name || '';
  document.getElementById('recordMonth').value = record.recordMonth || getCurrentMonthValue();
  document.getElementById('tenantName').value = master?.tenantName || record.tenantName || '';
  document.getElementById('tenantPhone').value = master?.tenantPhone || record.tenantPhone || '';
  document.getElementById('monthlyRent').value = Number(record.monthlyRent || 0);
  document.getElementById('paidAmount').value = Number(record.paidAmount || 0);
  document.getElementById('deposit').value = Number(record.deposit || 0);
  document.getElementById('balance').value = Number(record.balance || 0);
  document.getElementById('currentBill').value = Number(record.currentBill || 0);
  document.getElementById('waterBill').value = Number(record.waterBill || 0);
  document.getElementById('notes').value = record.notes || '';

  formSection.classList.remove('hidden');
}

function resetTenantForm() {
  tenantForm.reset();
  tenantSection.classList.add('hidden');
  state.editingMasterId = null;
}

function openTenantFormForEdit(master) {
  state.editingMasterId = master.id;
  document.getElementById('tenantHouseName').value = master.name || '';
  document.getElementById('tenantNameInput').value = master.tenantName || '';
  document.getElementById('tenantPhoneInput').value = master.tenantPhone || '';
  document.getElementById('tenantRentInput').value = Number(master.monthlyRent || 0);
  document.getElementById('tenantDepositInput').value = Number(master.deposit || 0);
  tenantSection.classList.remove('hidden');
}

function formatReportPeriod(monthValue) {
  if (!monthValue) return 'N/A';
  const [year, month] = monthValue.split('-').map(Number);
  const startDate = new Date(year, month - 1, 5);
  const endDate = new Date(year, month, 5);

  const formatDate = (date) => {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yy = String(date.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
  };

  return `${formatDate(startDate)} to ${formatDate(endDate)}`;
}

function extractHouseNumber(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const match = raw.match(/(\d+)/);
  return match ? match[1] : raw;
}

function addBillCard(doc, property, x, y, width) {
  const cardHeight = 62;
  const labelX = x + 3;
  const valueX = x + width - 3;
  const rentValue = Number(property.monthlyRent || 0);
  const billsValue = Number(property.currentBill || 0) + Number(property.waterBill || 0);
  const paidValue = Number(property.paidAmount || 0);
  const pendingValue = Math.max(0, Number(property.balance || 0) - rentValue - billsValue + paidValue);
  const totalValue = rentValue + pendingValue + billsValue;
  const notesText = (property.notes || '').trim();

  doc.setDrawColor(70, 70, 70);
  doc.setLineWidth(0.4);
  doc.roundedRect(x, y, width, cardHeight, 1, 1, 'S');

  doc.setFillColor(234, 234, 234);
  doc.rect(x, y, width, 8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.text('Arer Apartment Rental Bill', x + width / 2, y + 5.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const lines = [
    ['H No-', extractHouseNumber(property.name || property.propertyId || '')],
    ['Tenant -', property.tenantName || 'N/A'],
    ['Period -', formatReportPeriod(property.recordMonth)],
    ['Rental amount-', formatCurrency(rentValue)],
  ];

  if (pendingValue > 0) {
    lines.push(['Pending amount', formatCurrency(pendingValue)]);
  }

  if (billsValue > 0) {
    lines.push(['Bore & Water', formatCurrency(billsValue)]);
  }

  if (notesText) {
    lines.push(['Notes', notesText]);
  }

  let currentY = y + 13;
  lines.forEach(([label, value]) => {
    doc.text(label, labelX, currentY);
    doc.text(String(value), valueX, currentY, { align: 'right' });
    currentY += 5.5;
  });

  doc.setFillColor(255, 229, 0);
  doc.rect(x, y + cardHeight - 8, width, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Total', labelX, y + cardHeight - 2.1);
  doc.text(formatCurrency(totalValue), valueX, y + cardHeight - 2.1, { align: 'right' });

  return cardHeight;
}

function exportPdf() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  const selectedMonth = getCurrentMonthValue();
  const monthLabel = new Date(`${selectedMonth}-01T00:00:00`).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  const visibleProperties = getPropertiesForSelectedMonth();
  const titleText = selectedMonth.endsWith('-08') ? 'August - September month rent' : `${monthLabel} month rent`;
  const cardWidth = 82;
  const gap = 6;
  const leftX = 14;
  const rightX = leftX + cardWidth + gap;
  const rowSpacing = 60;
  let y = 22;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(titleText, 14, 16);

  for (let index = 0; index < visibleProperties.length; index += 2) {
    if (y > 225) {
      doc.addPage();
      y = 18;
    }

    const leftProperty = visibleProperties[index];
    const rightProperty = visibleProperties[index + 1];

    if (leftProperty) {
      addBillCard(doc, leftProperty, leftX, y, cardWidth);
    }

    if (rightProperty) {
      addBillCard(doc, rightProperty, rightX, y, cardWidth);
    }

    y += rowSpacing;
  }

  doc.save(`rental-report-${selectedMonth}.pdf`);
}

function render() {
  updateStats();
  getMonthlySummary();
  renderTable();
}

function syncFromCloud() {
  return fetch(CF_API, { method: 'GET' })
    .then((response) => {
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      return response.json();
    })
    .then((remote) => {
      if (!Array.isArray(remote) || remote.length === 0) {
        return false;
      }
      state.monthlyRecords = remote.map((record) => ({
        ...record,
        id: sanitizeRecordId(record.id || `${record.propertyId}-${record.recordMonth}`),
        balance: Number(record.balance || 0),
        paidAmount: Number(record.paidAmount || 0),
        monthlyRent: Number(record.monthlyRent || 0),
        deposit: Number(record.deposit || 0),
        currentBill: Number(record.currentBill || 0),
        waterBill: Number(record.waterBill || 0),
        notes: record.notes || '',
      }));
      rebuildMastersFromRecords();
      ensureMissingMonthlyRecords();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.monthlyRecords));
      localStorage.setItem(MASTER_KEY, JSON.stringify(state.propertyMasters));
      render();
      return true;
    })
    .catch((error) => {
      console.warn('Cloud sync skipped:', error.message);
      return false;
    });
}

propertyForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const selectedRecord = state.monthlyRecords.find((record) => record.id === state.editingRecordId) || null;
  if (!selectedRecord) {
    alert('Please select a property row before saving.');
    return;
  }

  const recordMonth = document.getElementById('recordMonth').value || selectedRecord.recordMonth;
  const targetRecord = state.monthlyRecords.find((record) => String(record.propertyId) === String(selectedRecord.propertyId) && record.recordMonth === recordMonth) || selectedRecord;
  const propertyId = String(targetRecord.propertyId);
  const previousOutstanding = getPreviousOutstanding(propertyId, recordMonth);
  const monthlyRent = Number(document.getElementById('monthlyRent').value || 0);
  const paidAmount = isUpcomingMonth(recordMonth) ? 0 : Number(document.getElementById('paidAmount').value || 0);
  const currentBill = Number(document.getElementById('currentBill').value || 0);
  const waterBill = Number(document.getElementById('waterBill').value || 0);
  const deposit = Number(document.getElementById('deposit').value || 0);
  const notes = document.getElementById('notes').value.trim();
  const computedBalance = previousOutstanding + monthlyRent + currentBill + waterBill - paidAmount;

  const updatedRecord = {
    ...targetRecord,
    propertyId,
    recordMonth,
    monthlyRent,
    paidAmount,
    currentBill,
    waterBill,
    deposit,
    notes,
    balance: computedBalance,
  };

  const master = findPropertyMaster(propertyId);
  if (master) {
    master.name = document.getElementById('name').value.trim() || master.name;
    master.tenantName = document.getElementById('tenantName').value.trim() || master.tenantName;
    master.tenantPhone = document.getElementById('tenantPhone').value.trim() || master.tenantPhone;
    master.monthlyRent = monthlyRent;
    master.deposit = deposit;
  }

  state.monthlyRecords = state.monthlyRecords.map((record) => {
    if (String(record.propertyId) !== String(propertyId)) {
      return record;
    }

    const recordPreviousOutstanding = getPreviousOutstanding(propertyId, record.recordMonth);
    const sameMonth = record.recordMonth === recordMonth;
    const updatedMonthlyRent = sameMonth ? monthlyRent : Number(record.monthlyRent || 0);
    const updatedPaidAmount = sameMonth ? paidAmount : Number(record.paidAmount || 0);
    const updatedCurrentBill = sameMonth ? currentBill : Number(record.currentBill || 0);
    const updatedWaterBill = sameMonth ? waterBill : Number(record.waterBill || 0);
    const updatedDeposit = sameMonth ? deposit : Number(record.deposit || 0);
    const updatedNotes = sameMonth ? notes : record.notes || '';
    const updatedBalance = record.recordMonth === recordMonth
      ? previousOutstanding + updatedMonthlyRent + updatedCurrentBill + updatedWaterBill - updatedPaidAmount
      : Number(record.balance || 0);

    return {
      ...record,
      name: master?.name || record.name || '',
      tenantName: master?.tenantName || record.tenantName || '',
      tenantPhone: master?.tenantPhone || record.tenantPhone || '',
      monthlyRent: updatedMonthlyRent,
      deposit: updatedDeposit,
      currentBill: updatedCurrentBill,
      waterBill: updatedWaterBill,
      paidAmount: updatedPaidAmount,
      notes: updatedNotes,
      balance: updatedBalance,
    };
  });

  saveMasters();
  saveMonthlyRecords();
  render();
  resetForm();
});

tenantForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const name = document.getElementById('tenantHouseName').value.trim();
  const tenantName = document.getElementById('tenantNameInput').value.trim();
  const tenantPhone = document.getElementById('tenantPhoneInput').value.trim();
  const monthlyRent = Number(document.getElementById('tenantRentInput').value || 0);
  const deposit = Number(document.getElementById('tenantDepositInput').value || 0);

  if (!name || !tenantName) {
    alert('House name and tenant name are required.');
    return;
  }

  let master = state.propertyMasters.find((item) => String(item.id) === String(state.editingMasterId)) || null;

  if (!master) {
    const nextId = String(state.propertyMasters.length + 1);
    master = {
      id: nextId,
      name,
      tenantName,
      tenantPhone,
      monthlyRent,
      deposit,
    };
    state.propertyMasters.push(master);

    getMonthOptions().forEach((month) => {
      const previousOutstanding = getPreviousOutstanding(nextId, month);
      state.monthlyRecords.push({
        id: `${nextId}-${month}`,
        propertyId: nextId,
        recordMonth: month,
        name,
        tenantName,
        tenantPhone,
        monthlyRent,
        paidAmount: 0,
        deposit,
        currentBill: 0,
        waterBill: 0,
        notes: '',
        balance: previousOutstanding + monthlyRent,
      });
    });
  } else {
    master.name = name;
    master.tenantName = tenantName;
    master.tenantPhone = tenantPhone;
    master.monthlyRent = monthlyRent;
    master.deposit = deposit;

    state.monthlyRecords = state.monthlyRecords.map((record) => {
      if (String(record.propertyId) !== String(master.id)) {
        return record;
      }

      const previousOutstanding = getPreviousOutstanding(master.id, record.recordMonth);
      return {
        ...record,
        name,
        tenantName,
        tenantPhone,
        monthlyRent,
        deposit,
        currentBill: Number(record.currentBill || 0),
        waterBill: Number(record.waterBill || 0),
        notes: record.notes || '',
        balance: previousOutstanding + monthlyRent + Number(record.currentBill || 0) + Number(record.waterBill || 0) - Number(record.paidAmount || 0),
      };
    });
  }

  saveMasters();
  saveMonthlyRecords();
  render();
  resetTenantForm();
});

addPropertyBtn.addEventListener('click', () => {
  state.editingMasterId = null;
  tenantForm.reset();
  document.getElementById('tenantHouseName').value = '';
  document.getElementById('tenantNameInput').value = '';
  document.getElementById('tenantPhoneInput').value = '';
  document.getElementById('tenantRentInput').value = 0;
  document.getElementById('tenantDepositInput').value = 0;
  tenantSection.classList.remove('hidden');
});

recordMonthInput = document.getElementById('recordMonth');
if (recordMonthInput) {
  recordMonthInput.addEventListener('change', () => {
    const selectedMonth = recordMonthInput.value || getCurrentMonthValue();
    if (isUpcomingMonth(selectedMonth)) {
      document.getElementById('paidAmount').value = 0;
    }
  });
}

cancelBtn.addEventListener('click', resetForm);
tenantCancelBtn.addEventListener('click', resetTenantForm);
monthSelector.addEventListener('change', render);
pdfBtn.addEventListener('click', exportPdf);

propertyTableBody.addEventListener('click', (event) => {
  const row = event.target.closest('tr[data-property-id]');
  const editBtn = event.target.closest('.edit-btn');
  const deleteBtn = event.target.closest('.delete-btn');

  if (row) {
    state.selectedPropertyId = String(row.dataset.propertyId);
  }

  if (deleteBtn) {
    deleteProperty(deleteBtn.dataset.id);
    return;
  }

  if (editBtn) {
    const record = state.monthlyRecords.find((item) => item.id === editBtn.dataset.id);
    if (record) {
      state.selectedPropertyId = String(record.propertyId);
      openMonthlyFormForEdit(record);
    }
  }
});

readData();
monthSelector.value = currentMonthValue;
const monthLabelEl = document.getElementById('monthLabel');
if (monthLabelEl) {
  monthLabelEl.textContent = getMonthLabel(monthSelector.value || currentMonthValue);
}

(async () => {
  const loadedFromCloud = await syncFromCloud();
  if (!loadedFromCloud) {
    const storedRecords = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(storedRecords) && storedRecords.length > 0) {
      state.monthlyRecords = storedRecords.map(normalizeRecord);
      rebuildMastersFromRecords();
    } else {
      seedData();
    }
  }
  render();
})();
