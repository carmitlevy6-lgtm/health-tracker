// ============================================================
// Health Tracker
// Step 1: switching between screens and opening Setup.
// Step 2: saving data in the browser + backup (download / restore).
// Step 3: Setup – supplements & medications, weekly workout schedule.
// Step 4: Today – checklist of scheduled supplements & medications.
// Step 5: Date navigation + schedules that keep their history.
// Step 6: Sleep & symptoms morning check-in.
// Step 7: Exercise – planned sessions and unplanned workouts.
// Step 8: Migraine episodes and as-needed (PRN) medication intake.
// Step 9: History – recorded days at a glance, opening into the Daily Log.
// Step 10: Dashboard – compact weekly / monthly summary.
// ============================================================


// ------------------------------------------------------------
// STORAGE
// Everything the app saves goes through this section. When we
// move to the cloud later, this is the part that changes.
// ------------------------------------------------------------

const STORAGE_KEY = 'healthTracker.data';               // where your data lives in the browser
const SAFETY_COPY_KEY = 'healthTracker.beforeRestore';  // copy kept so a restore can be undone
const DATA_VERSION = 3;                                 // bumps if the data layout ever changes

// The earliest date you can view or record in this version of the app.
// It is only a limit – nothing is ever filled in automatically from it.
const EARLIEST_DATE = '2026-10-01';

// What a brand-new, empty notebook looks like
function createEmptyData() {
  return {
    app: 'health-tracker',
    version: DATA_VERSION,
    settings: {
      supplements: [],   // filled in Step 3
      workoutPlan: [],   // filled in Step 3
    },
    days: {},            // one record per date, e.g. days['2026-11-10'] (Steps 4–7)
    meta: {
      createdAt: new Date().toISOString(),
      updatedAt: null,
      lastBackupAt: null,
    },
  };
}

// Read the saved notebook (or start a new one)
function loadData() {
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    showStorageWarning();
    return createEmptyData();
  }
  if (!saved) return createEmptyData();

  try {
    return upgradeData(JSON.parse(saved));
  } catch (error) {
    // The saved data is damaged. Keep a copy of it rather than overwriting it.
    try { localStorage.setItem(STORAGE_KEY + '.damaged', saved); } catch (e) {}
    showStorageWarning();
    return createEmptyData();
  }
}

// Write the notebook back to the browser. Returns true if it worked.
function saveData() {
  data.meta.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    showStorageWarning();
    return false;
  }
}

// Brings data saved by an older version of the app up to date.
// It only ADDS missing information; it never removes or resets anything.
function upgradeData(someData) {
  // Version 1 → 2: each supplement/medication now says whether it is
  // "scheduled" (regular days and times) or "prn" (as needed).
  // Everything created before this existed was scheduled.
  (someData.settings.supplements || []).forEach(function (item) {
    item.times = item.times || [];
    item.days = item.days || [];
    // (an item without any times can only be an as-needed one)
    if (!item.schedule) item.schedule = item.times.length ? 'scheduled' : 'prn';
  });

  // Version 2 → 3: schedules can have several versions over time.
  // Versions of the same item share a "seriesId"; existing items
  // simply become the first version of their own series.
  someData.settings.supplements = someData.settings.supplements || [];
  someData.settings.workoutPlan = someData.settings.workoutPlan || [];
  someData.settings.supplements.concat(someData.settings.workoutPlan).forEach(function (item) {
    if (!item.seriesId) item.seriesId = item.id;
  });

  if (someData.version < DATA_VERSION) someData.version = DATA_VERSION;
  return someData;
}

function showStorageWarning() {
  document.getElementById('storage-warning').hidden = false;
}

// Does this look like a backup made by this app?
function isValidBackup(backup) {
  return Boolean(backup) &&
    backup.app === 'health-tracker' &&
    typeof backup.version === 'number' &&
    typeof backup.settings === 'object' && backup.settings !== null &&
    typeof backup.days === 'object' && backup.days !== null;
}

// The data currently in use by the app
let data = loadData();


// ------------------------------------------------------------
// SMALL HELPERS
// ------------------------------------------------------------

// A date as 'YYYY-MM-DD' in your own time zone (used as the key for each day)
function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

// e.g. "Nov 10, 9:41 PM"
function formatDateTime(isoText) {
  return new Date(isoText).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// e.g. "3 supplements/meds · 4 planned workouts · 12 days recorded"
// (counts each item once, however many schedule versions it has)
function describeData(someData) {
  const supplements = currentVersions(someData.settings.supplements || []).length;
  const workouts = currentVersions(someData.settings.workoutPlan || []).length;
  const days = Object.keys(someData.days).length;
  return count(supplements, 'supplement/med', 'supplements/meds') + ' · ' +
    count(workouts, 'planned workout', 'planned workouts') + ' · ' +
    count(days, 'day recorded', 'days recorded');
}

// e.g. count(1, 'day', 'days') → "1 day", count(3, 'day', 'days') → "3 days"
function count(number, singular, plural) {
  return number + ' ' + (number === 1 ? singular : plural);
}


// ------------------------------------------------------------
// BACKUP (in Setup)
// ------------------------------------------------------------

function backupFileName() {
  return 'health-tracker-backup-' + dateKey(new Date()) + '.json';
}

function backupText() {
  return JSON.stringify(data, null, 2);
}

function markBackedUp() {
  data.meta.lastBackupAt = new Date().toISOString();
  saveData();
  renderBackupCard();
}

// Save a backup file to the device (phone: the Downloads folder)
function downloadBackup() {
  markBackedUp();  // first, so the file itself records when it was made
  const blob = new Blob([backupText()], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = backupFileName();
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  showBackupMessage('Backup downloaded. Move it to your private Google Drive folder.', 'success');
}

// On phones (once the app is on a secure https address) you can send the
// backup straight to the Google Drive app through the normal Share menu.
// You choose where it goes; the app never gets access to your Drive.
function canShareFiles() {
  try {
    const testFile = new File(['{}'], 'test.json', { type: 'application/json' });
    return Boolean(navigator.canShare && navigator.canShare({ files: [testFile] }));
  } catch (error) {
    return false;
  }
}

async function shareBackup() {
  const previousBackupAt = data.meta.lastBackupAt;
  data.meta.lastBackupAt = new Date().toISOString();
  const file = new File([backupText()], backupFileName(), { type: 'application/json' });
  try {
    await navigator.share({ files: [file], title: 'Health Tracker backup' });
    saveData();
    renderBackupCard();
    showBackupMessage('Backup shared.', 'success');
  } catch (error) {
    data.meta.lastBackupAt = previousBackupAt;  // not shared, so don't count it
    if (error.name !== 'AbortError') {
      showBackupMessage('Sharing did not work. Use "Download backup" instead.', 'error');
    }
  }
}

// Replace the current data with a backup file you picked
function restoreFromFile(file) {
  const reader = new FileReader();
  reader.onload = function () {
    let backup;
    try {
      backup = JSON.parse(reader.result);
    } catch (error) {
      showBackupMessage('That file is not a Health Tracker backup.', 'error');
      return;
    }
    if (!isValidBackup(backup)) {
      showBackupMessage('That file is not a Health Tracker backup.', 'error');
      return;
    }
    if (backup.version > DATA_VERSION) {
      showBackupMessage('This backup was made by a newer version of the app.', 'error');
      return;
    }
    upgradeData(backup);   // older backups are brought up to date (only adds information)

    const madeAt = backup.meta && backup.meta.lastBackupAt ? formatDateTime(backup.meta.lastBackupAt) : 'unknown date';
    const ok = confirm(
      'Restore this backup?\n\n' +
      'Backup from: ' + madeAt + '\n' +
      describeData(backup) + '\n\n' +
      'This replaces the data currently in this browser. You can undo it afterwards.'
    );
    if (!ok) return;

    // Keep the current data aside so the restore can be undone
    try {
      localStorage.setItem(SAFETY_COPY_KEY, JSON.stringify(data));
    } catch (error) {
      showBackupMessage('Could not make a safety copy, so nothing was changed.', 'error');
      return;
    }

    data = upgradeData(backup);
    saveData();
    renderSetup();
    showBackupMessage('Backup restored.', 'success');
  };
  reader.readAsText(file);
}

// Put back the data that was there before the last restore
function undoRestore() {
  let previous;
  try {
    previous = JSON.parse(localStorage.getItem(SAFETY_COPY_KEY));
  } catch (error) {
    previous = null;
  }
  if (!isValidBackup(previous)) return;
  if (!confirm('Go back to your data from before the last restore?\n\n' + describeData(previous))) return;

  data = upgradeData(previous);
  saveData();
  try { localStorage.removeItem(SAFETY_COPY_KEY); } catch (error) {}
  renderSetup();
  showBackupMessage('Restore undone.', 'success');
}

function hasSafetyCopy() {
  try {
    return Boolean(localStorage.getItem(SAFETY_COPY_KEY));
  } catch (error) {
    return false;
  }
}

function showBackupMessage(text, type) {
  const message = document.getElementById('backup-message');
  message.textContent = text;
  message.className = 'message ' + type;
  message.hidden = false;
}

// Fill in the Backup card with up-to-date information
function renderBackupCard() {
  document.getElementById('data-summary').textContent = describeData(data);

  const lastBackup = document.getElementById('last-backup');
  const last = data.meta.lastBackupAt;
  const daysSince = last ? (Date.now() - new Date(last).getTime()) / 86400000 : Infinity;
  lastBackup.textContent = last ? 'Last backup: ' + formatDateTime(last) : 'Last backup: never';
  lastBackup.classList.toggle('overdue', daysSince > 7);

  document.getElementById('share-button').hidden = !canShareFiles();
  document.getElementById('undo-restore-button').hidden = !hasSafetyCopy();
}


// ------------------------------------------------------------
// SETUP: supplements & medications + weekly workout schedule (Step 3)
// ------------------------------------------------------------

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];   // 0 = Sunday … 6 = Saturday

const SCHEDULE_TYPES = [
  { value: 'scheduled', label: '🗓️ Scheduled' },
  { value: 'prn', label: '⚡ As needed (PRN)' },
];
const SUPPLEMENT_TYPES = [
  { value: 'supplement', label: '🌿 Supplement' },
  { value: 'medication', label: '💊 Medication' },
];
const WORKOUT_TYPES = [
  { value: 'running', label: '🏃 Running' },
  { value: 'karate', label: '🥋 Karate' },
  { value: 'strength', label: '🏋️ Strength training' },
];
const TIMES_OF_DAY = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
];

function optionLabel(options, value) {
  const option = options.find(function (o) { return o.value === value; });
  return option ? option.label : value;
}

// A unique, permanent id for each item, e.g. "sup-lz3k9a-x8f2q"
function newId(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

// Makes text safe to show on the page (so a name like "<b>" shows as typed)
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function todayKey() { return dateKey(new Date()); }

function keyToDate(key) {
  const parts = key.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

// e.g. "Nov 10, 2026"
function formatShortDate(key) {
  return keyToDate(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// --- Which items belong on the schedule for a given date? ---
// Each item remembers the day it was added (activeFrom) and the day it was
// archived (archivedOn). It only counts for dates in between. The Today and
// History cards (Steps 4–8) will use these two functions.
function isActiveOn(item, key) {
  return item.activeFrom <= key && (!item.archivedOn || key < item.archivedOn);
}
// Scheduled items only. As-needed (PRN) medications never appear on a
// daily checklist, so they can never be counted as missed.
function supplementsForDate(key) {
  const weekday = keyToDate(key).getDay();
  return data.settings.supplements.filter(function (s) {
    return s.schedule !== 'prn' && isActiveOn(s, key) && s.days.includes(weekday);
  });
}

// As-needed medications you can choose from when logging an intake or a
// migraine (Steps 7 and 8). Archived ones are left out of the choices.
function prnMedications() {
  return currentVersions(data.settings.supplements).filter(function (s) {
    return s.schedule === 'prn' && !s.archived;
  });
}
function workoutsForDate(key) {
  const weekday = keyToDate(key).getDay();
  return data.settings.workoutPlan.filter(function (w) {
    return isActiveOn(w, key) && w.day === weekday;
  });
}

// --- Schedule versions (Step 5) ---
// When a schedule changes "from" a certain date, the old version stops the
// day before and a new version starts on that date, so older dates keep the
// schedule that really applied then. All versions of one item share a
// seriesId. (archivedOn = the first day a version no longer applies.)

function seriesKey(item) {
  return item.seriesId || item.id;
}

// All versions of one item, oldest first
function versionsOf(list, item) {
  return list
    .filter(function (other) { return seriesKey(other) === seriesKey(item); })
    .sort(function (a, b) { return a.activeFrom.localeCompare(b.activeFrom); });
}

// The newest version of every item – what Setup shows
function currentVersions(list) {
  const newest = {};
  list.forEach(function (item) {
    const key = seriesKey(item);
    if (!newest[key] || item.activeFrom > newest[key].activeFrom) newest[key] = item;
  });
  return Object.values(newest);
}

// Save a schedule change that applies from a given date
function applyScheduleChange(list, current, changes, applyFrom, idPrefix) {
  const now = new Date().toISOString();
  if (applyFrom <= current.activeFrom) {
    // starts the same day as the current version: just update it
    Object.assign(current, changes, { updatedAt: now });
    return;
  }
  current.archivedOn = applyFrom;      // old version ends the day before
  current.updatedAt = now;
  list.push(Object.assign({}, current, changes, {
    id: newId(idPrefix),
    activeFrom: applyFrom,
    archived: false,
    archivedOn: null,
    createdAt: now,
    updatedAt: now,
  }));
}

// e.g. "Nov 1"
function formatDayMonth(key) {
  return keyToDate(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// The "Schedule history" box in an edit form (only when there are 2+ versions)
function renderScheduleHistory(form, versions, describe) {
  const box = form.querySelector('.schedule-history');
  box.hidden = versions.length < 2;
  if (versions.length < 2) return;
  box.innerHTML = '<p class="field-label">Schedule history</p>' + versions.map(function (v) {
    const range = v.archivedOn && !v.archived
      ? formatDayMonth(v.activeFrom) + ' – ' + formatDayMonth(addDays(v.archivedOn, -1))
      : 'From ' + formatDayMonth(v.activeFrom);
    return '<p class="history-line"><strong>' + range + ':</strong> ' + describe(v) + '</p>';
  }).join('');
}

// "Started on" must be between October 1, 2026 and today
function checkStartedOn(startedOn) {
  if (!startedOn) return '';
  if (startedOn > todayKey()) return '"Started on" can\'t be in the future.';
  if (startedOn < EARLIEST_DATE) return '"Started on" can\'t be before ' + formatShortDate(EARLIEST_DATE) + '.';
  return '';
}

// Sets the allowed range on the two date fields of a Setup form
function limitScheduleDateFields(form) {
  const today = todayKey();
  ['startedOn', 'applyFrom'].forEach(function (name) {
    form.elements[name].min = EARLIEST_DATE;
    form.elements[name].max = today;
  });
}

// Checks the "Started on" and "Apply from" dates before anything is saved.
// Returns an error message, or '' when everything is fine.
function checkScheduleDates(versions, startedOn, scheduleChanged, applyFrom) {
  const today = todayKey();
  const current = versions[versions.length - 1];
  const startProblem = checkStartedOn(startedOn);
  if (startProblem) return startProblem;
  if (startedOn && versions.length > 1 && startedOn >= versions[1].activeFrom) {
    return '"Started on" must be before ' + formatDayMonth(versions[1].activeFrom) + ', when the schedule was changed.';
  }
  if (!scheduleChanged) return '';
  const currentStart = versions.length === 1 && startedOn ? startedOn : current.activeFrom;
  if (!applyFrom) return 'Please choose the date this change applies from.';
  if (applyFrom > today) return '"Apply from" can\'t be in the future.';
  if (applyFrom < EARLIEST_DATE) return '"Apply from" can\'t be before ' + formatShortDate(EARLIEST_DATE) + '.';
  if (applyFrom < currentStart) {
    return '"Apply from" can\'t be before ' + formatDayMonth(currentStart) + ', when the current schedule started.';
  }
  return '';
}

// --- Archive / restore (nothing is ever erased) ---
function archiveItem(item) {
  item.archived = true;
  item.archivedOn = todayKey();
  item.updatedAt = new Date().toISOString();
}
function restoreItem(item) {
  item.archived = false;
  item.archivedOn = null;
  item.updatedAt = new Date().toISOString();
}

// --- Building the tap-to-choose buttons in the forms ---
function buildChoices(containerId, inputType, inputName, options) {
  document.getElementById(containerId).innerHTML = options.map(function (option) {
    return '<label class="chip"><input type="' + inputType + '" name="' + inputName + '" value="' + option.value + '">' +
      '<span>' + option.label + '</span></label>';
  }).join('');
}
const DAY_OPTIONS = WEEKDAYS_SHORT.map(function (name, index) { return { value: index, label: name }; });

buildChoices('schedule-choices', 'radio', 'scheduleType', SCHEDULE_TYPES);
buildChoices('supplement-type-choices', 'radio', 'supplementType', SUPPLEMENT_TYPES);
buildChoices('frequency-choices', 'radio', 'frequency', [
  { value: 'daily', label: 'Every day' },
  { value: 'selected', label: 'Selected days' },
]);
buildChoices('supplement-days', 'checkbox', 'days', DAY_OPTIONS);
buildChoices('workout-type-choices', 'radio', 'workoutType', WORKOUT_TYPES);
buildChoices('workout-day-choices', 'radio', 'weekday', DAY_OPTIONS);
buildChoices('time-of-day-choices', 'radio', 'timeOfDay', TIMES_OF_DAY);

function showFormError(form, text) {
  const box = form.querySelector('.form-error');
  box.textContent = text;
  box.hidden = false;
}
function hideFormError(form) {
  form.querySelector('.form-error').hidden = true;
}


// --- Supplements & medications form ---

const supplementDialog = document.getElementById('supplement-dialog');
const supplementForm = document.getElementById('supplement-form');
let editingSupplementId = null;   // null = adding a new item

function addTimeRow(value) {
  const row = document.createElement('div');
  row.className = 'time-row';
  row.innerHTML = '<input type="time" aria-label="Scheduled time">' +
    '<button type="button" class="remove-time" aria-label="Remove this time">✕</button>';
  row.querySelector('input').value = value || '';
  document.getElementById('time-list').appendChild(row);
  updateRemoveTimeButtons();
}

// Hide the ✕ when there is only one time left
function updateRemoveTimeButtons() {
  const rows = document.querySelectorAll('#time-list .time-row');
  rows.forEach(function (row) {
    row.querySelector('.remove-time').hidden = rows.length === 1;
  });
}

// Show the weekday buttons only when "Selected days" is chosen
function updateDayPicker() {
  document.getElementById('supplement-days').hidden = supplementForm.elements.frequency.value !== 'selected';
}

// "As needed" items have no type, times or days to fill in
function updateScheduleFields() {
  const asNeeded = supplementForm.elements.scheduleType.value === 'prn';
  document.getElementById('scheduled-fields').hidden = asNeeded;
  document.getElementById('prn-note').hidden = !asNeeded;
  document.getElementById('dosage-label').textContent = asNeeded ? 'Usual dosage' : 'Dosage';
}

function openSupplementForm(id) {
  const item = data.settings.supplements.find(function (s) { return s.id === id; });
  editingSupplementId = item ? item.id : null;

  supplementForm.reset();
  hideFormError(supplementForm);
  document.getElementById('supplement-dialog-title').textContent = item ? 'Edit item' : 'Add supplement or medication';
  supplementForm.elements.itemName.value = item ? item.name : '';
  supplementForm.elements.scheduleType.value = item ? item.schedule : 'scheduled';
  supplementForm.elements.dosage.value = item ? item.dosage : '';
  supplementForm.elements.supplementType.value = item ? item.type : 'supplement';

  // (an as-needed item has no times or days, so offer sensible defaults
  //  in case you switch it to Scheduled)
  document.getElementById('time-list').innerHTML = '';
  (item && item.times.length ? item.times : ['08:00']).forEach(function (time) { addTimeRow(time); });

  const everyDay = !item || item.days.length === 7 || item.days.length === 0;
  supplementForm.elements.frequency.value = everyDay ? 'daily' : 'selected';
  supplementForm.querySelectorAll('input[name="days"]').forEach(function (box) {
    box.checked = Boolean(item) && item.days.includes(Number(box.value));
  });
  updateDayPicker();
  updateScheduleFields();

  // Dates: "Started on" = when the first version began; "Apply from" defaults to today
  const today = todayKey();
  const versions = item ? versionsOf(data.settings.supplements, item) : [];
  supplementForm.elements.startedOn.value = item ? versions[0].activeFrom : today;
  supplementForm.elements.applyFrom.value = today;
  limitScheduleDateFields(supplementForm);
  renderScheduleHistory(supplementForm, versions, describeSupplementVersion);
  updateSupplementApplyFrom();

  document.getElementById('archive-supplement-button').hidden = !item;
  supplementDialog.showModal();
}

function describeSupplementVersion(v) {
  if (v.schedule === 'prn') return (v.dosage ? escapeHtml(v.dosage) + ' · ' : '') + 'As needed';
  return (v.dosage ? escapeHtml(v.dosage) + ' · ' : '') + v.times.join(', ') + ' · ' + daysSummary(v.days);
}

// Everything the form currently says, tidied up
function readSupplementForm() {
  const fields = supplementForm.elements;
  const schedule = fields.scheduleType.value;
  const asNeeded = schedule === 'prn';

  // all filled-in times, without duplicates, earliest first
  // (as-needed medications have no times or days)
  const times = asNeeded ? [] : Array.from(document.querySelectorAll('#time-list input'))
    .map(function (input) { return input.value; })
    .filter(Boolean)
    .filter(function (time, index, list) { return list.indexOf(time) === index; })
    .sort();

  const days = asNeeded ? [] : fields.frequency.value === 'daily'
    ? ALL_DAYS.slice()
    : Array.from(supplementForm.querySelectorAll('input[name="days"]:checked')).map(function (box) { return Number(box.value); });

  return {
    name: fields.itemName.value.trim(),
    dosage: fields.dosage.value.trim(),
    schedule: schedule,
    type: asNeeded ? 'medication' : fields.supplementType.value,   // as-needed items are always medications
    times: times,
    days: days,
    startedOn: fields.startedOn.value,
    applyFrom: fields.applyFrom.value,
  };
}

// Does the form change the schedule itself (not just the name)?
function supplementScheduleChanged(values, item) {
  return values.schedule !== item.schedule ||
    values.dosage !== item.dosage ||
    values.times.join() !== item.times.join() ||
    values.days.slice().sort().join() !== item.days.slice().sort().join();
}

// Show "Apply this change from" only when editing changes the schedule
function updateSupplementApplyFrom() {
  const item = data.settings.supplements.find(function (s) { return s.id === editingSupplementId; });
  supplementForm.querySelector('.apply-from').hidden = !item || !supplementScheduleChanged(readSupplementForm(), item);
}

function saveSupplementForm(event) {
  event.preventDefault();
  const values = readSupplementForm();
  const asNeeded = values.schedule === 'prn';
  const list = data.settings.supplements;

  if (!values.name) return showFormError(supplementForm, 'Please enter a name.');
  if (!asNeeded && values.times.length === 0) return showFormError(supplementForm, 'Please add at least one time.');
  if (!asNeeded && values.days.length === 0) return showFormError(supplementForm, 'Please pick at least one day.');

  const now = new Date().toISOString();
  const existing = list.find(function (s) { return s.id === editingSupplementId; });

  if (existing) {
    const versions = versionsOf(list, existing);
    const changed = supplementScheduleChanged(values, existing);
    const problem = checkScheduleDates(versions, values.startedOn, changed, values.applyFrom);
    if (problem) return showFormError(supplementForm, problem);

    if (values.startedOn) versions[0].activeFrom = values.startedOn;
    // the name is a label, not part of the schedule: fix it on every version
    versions.forEach(function (v) { v.name = values.name; });

    if (changed) {
      applyScheduleChange(list, existing, {
        schedule: values.schedule, dosage: values.dosage, type: values.type,
        times: values.times, days: values.days,
      }, values.applyFrom, 'sup');
    } else {
      existing.type = values.type;
      existing.updatedAt = now;
    }
  } else {
    const startedOn = values.startedOn || todayKey();
    const startProblem = checkStartedOn(startedOn);
    if (startProblem) return showFormError(supplementForm, startProblem);
    const id = newId('sup');
    list.push({
      id: id,
      seriesId: id,
      name: values.name,
      schedule: values.schedule,
      dosage: values.dosage,
      type: values.type,
      times: values.times,
      days: values.days,
      activeFrom: startedOn,
      archived: false,
      archivedOn: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  saveData();
  supplementDialog.close();
  renderSetup();
  renderTodaySupplements();
}

function archiveSupplementFromForm() {
  const item = data.settings.supplements.find(function (s) { return s.id === editingSupplementId; });
  if (!item) return;
  const ok = confirm('Archive "' + item.name + '"?\n\nIt will leave your schedule from today. ' +
    'Your past records are kept, and you can restore it any time.');
  if (!ok) return;
  archiveItem(item);
  saveData();
  supplementDialog.close();
  renderSetup();
}


// --- Weekly workout schedule form ---

const workoutDialog = document.getElementById('workout-dialog');
const workoutForm = document.getElementById('workout-form');
let editingWorkoutId = null;

function openWorkoutForm(id) {
  const item = data.settings.workoutPlan.find(function (w) { return w.id === id; });
  editingWorkoutId = item ? item.id : null;

  workoutForm.reset();
  hideFormError(workoutForm);
  document.getElementById('workout-dialog-title').textContent = item ? 'Edit planned workout' : 'Add planned workout';
  if (item) {
    workoutForm.elements.workoutType.value = item.type;
    workoutForm.elements.weekday.value = String(item.day);
    workoutForm.elements.timeOfDay.value = item.timeOfDay;
  }

  const today = todayKey();
  const versions = item ? versionsOf(data.settings.workoutPlan, item) : [];
  workoutForm.elements.startedOn.value = item ? versions[0].activeFrom : today;
  workoutForm.elements.applyFrom.value = today;
  limitScheduleDateFields(workoutForm);
  renderScheduleHistory(workoutForm, versions, describeWorkoutVersion);
  updateWorkoutApplyFrom();

  document.getElementById('archive-workout-button').hidden = !item;
  workoutDialog.showModal();
}

function describeWorkoutVersion(v) {
  return optionLabel(WORKOUT_TYPES, v.type) + ' · ' + WEEKDAYS_SHORT[v.day] + ' ' + optionLabel(TIMES_OF_DAY, v.timeOfDay);
}

function readWorkoutForm() {
  const fields = workoutForm.elements;
  return {
    type: fields.workoutType.value,
    day: fields.weekday.value === '' ? null : Number(fields.weekday.value),
    timeOfDay: fields.timeOfDay.value,
    startedOn: fields.startedOn.value,
    applyFrom: fields.applyFrom.value,
  };
}

// For a planned workout, every field is part of the schedule
function workoutScheduleChanged(values, item) {
  return values.type !== item.type || values.day !== item.day || values.timeOfDay !== item.timeOfDay;
}

function updateWorkoutApplyFrom() {
  const item = data.settings.workoutPlan.find(function (w) { return w.id === editingWorkoutId; });
  workoutForm.querySelector('.apply-from').hidden = !item || !workoutScheduleChanged(readWorkoutForm(), item);
}

function saveWorkoutForm(event) {
  event.preventDefault();
  const values = readWorkoutForm();
  const list = data.settings.workoutPlan;

  if (!values.type) return showFormError(workoutForm, 'Please choose a workout.');
  if (values.day === null) return showFormError(workoutForm, 'Please choose a day.');
  if (!values.timeOfDay) return showFormError(workoutForm, 'Please choose a time of day.');

  const now = new Date().toISOString();
  const existing = list.find(function (w) { return w.id === editingWorkoutId; });

  if (existing) {
    const versions = versionsOf(list, existing);
    const changed = workoutScheduleChanged(values, existing);
    const problem = checkScheduleDates(versions, values.startedOn, changed, values.applyFrom);
    if (problem) return showFormError(workoutForm, problem);

    if (values.startedOn) versions[0].activeFrom = values.startedOn;
    if (changed) {
      applyScheduleChange(list, existing, {
        type: values.type, day: values.day, timeOfDay: values.timeOfDay,
      }, values.applyFrom, 'wo');
    } else {
      existing.updatedAt = now;
    }
  } else {
    const startedOn = values.startedOn || todayKey();
    const startProblem = checkStartedOn(startedOn);
    if (startProblem) return showFormError(workoutForm, startProblem);
    const id = newId('wo');
    list.push({
      id: id,
      seriesId: id,
      type: values.type,
      day: values.day,
      timeOfDay: values.timeOfDay,
      activeFrom: startedOn,
      archived: false,
      archivedOn: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  saveData();
  workoutDialog.close();
  renderSetup();
}

function archiveWorkoutFromForm() {
  const item = data.settings.workoutPlan.find(function (w) { return w.id === editingWorkoutId; });
  if (!item) return;
  const label = optionLabel(WORKOUT_TYPES, item.type) + ' on ' + WEEKDAYS[item.day];
  const ok = confirm('Archive ' + label + '?\n\nIt will leave your schedule from today. ' +
    'Your past records are kept, and you can restore it any time.');
  if (!ok) return;
  archiveItem(item);
  saveData();
  workoutDialog.close();
  renderSetup();
}


// --- Showing the lists in Setup ---

// e.g. "Every day" or "Mon, Wed, Fri"
function daysSummary(days) {
  if (days.length === 7) return 'Every day';
  return days.slice().sort().map(function (d) { return WEEKDAYS_SHORT[d]; }).join(', ');
}

function timeOfDayOrder(value) {
  return TIMES_OF_DAY.findIndex(function (t) { return t.value === value; });
}

// The collapsible "Archived (n)" list under each card
function renderArchive(prefix, items, describe) {
  const box = document.getElementById(prefix + '-archive');
  box.hidden = items.length === 0;
  box.querySelector('.archive-count').textContent = items.length;
  document.getElementById(prefix + '-archive-list').innerHTML = items.map(function (item) {
    return '<div class="archive-row"><span>' + describe(item) +
      '<span class="row-sub">Archived ' + formatShortDate(item.archivedOn) + '</span></span>' +
      '<button type="button" class="small-button" data-restore="' + escapeHtml(item.id) + '">Restore</button></div>';
  }).join('');
}

function supplementRow(s) {
  const details = s.schedule === 'prn'
    ? '💊 Medication · As needed'
    : optionLabel(SUPPLEMENT_TYPES, s.type) + ' · ' + s.times.join(', ') + ' · ' + daysSummary(s.days);
  return '<button type="button" class="list-row" data-id="' + escapeHtml(s.id) + '">' +
    '<span class="row-title">' + escapeHtml(s.name) +
    (s.dosage ? ' <span class="row-dose">· ' + escapeHtml(s.dosage) + '</span>' : '') + '</span>' +
    '<span class="row-sub">' + details + '</span></button>';
}

function renderSupplements() {
  const all = currentVersions(data.settings.supplements);   // one row per item
  const active = all.filter(function (s) { return !s.archived; });
  const scheduled = active.filter(function (s) { return s.schedule !== 'prn'; }).sort(function (a, b) {
    return (a.times[0] || '').localeCompare(b.times[0] || '') || a.name.localeCompare(b.name);
  });
  const asNeeded = active.filter(function (s) { return s.schedule === 'prn'; }).sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });

  let html = '';
  if (scheduled.length) {
    html += '<h3 class="day-heading">Scheduled</h3>' + scheduled.map(supplementRow).join('');
  }
  if (asNeeded.length) {
    html += '<h3 class="day-heading">As needed (PRN)</h3>' + asNeeded.map(supplementRow).join('');
  }
  document.getElementById('supplement-list').innerHTML = html ||
    '<p class="empty-text">Nothing here yet. Tap “+ Add” to add your first supplement or medication.</p>';

  renderArchive('supplement', all.filter(function (s) { return s.archived; }), function (s) {
    return escapeHtml(s.name) + (s.dosage ? ' · ' + escapeHtml(s.dosage) : '') + (s.schedule === 'prn' ? ' · As needed' : '');
  });
}

function renderWorkouts() {
  const all = currentVersions(data.settings.workoutPlan);   // one row per planned session
  const active = all.filter(function (w) { return !w.archived; });

  let html = '';
  WEEKDAYS.forEach(function (dayName, day) {
    const sessions = active
      .filter(function (w) { return w.day === day; })
      .sort(function (a, b) { return timeOfDayOrder(a.timeOfDay) - timeOfDayOrder(b.timeOfDay); });
    if (sessions.length === 0) return;
    html += '<h3 class="day-heading">' + dayName + '</h3>';
    html += sessions.map(function (w) {
      return '<button type="button" class="list-row" data-id="' + escapeHtml(w.id) + '">' +
        '<span class="row-title">' + optionLabel(WORKOUT_TYPES, w.type) + '</span>' +
        '<span class="row-sub">' + optionLabel(TIMES_OF_DAY, w.timeOfDay) + '</span></button>';
    }).join('');
  });

  document.getElementById('workout-list').innerHTML = html ||
    '<p class="empty-text">No workouts planned yet. Tap “+ Add” to plan your first session.</p>';
  document.getElementById('workout-count').textContent = active.length
    ? count(active.length, 'planned session', 'planned sessions') + ' per week'
    : '';
  document.getElementById('workout-count').hidden = active.length === 0;

  renderArchive('workout', all.filter(function (w) { return w.archived; }), function (w) {
    return optionLabel(WORKOUT_TYPES, w.type) + ' · ' + WEEKDAYS_SHORT[w.day] + ' ' + optionLabel(TIMES_OF_DAY, w.timeOfDay);
  });
}

function renderSetup() {
  renderSupplements();
  renderWorkouts();
  renderBackupCard();
}


// ------------------------------------------------------------
// TODAY: scheduled supplements & medications (Step 4)
// ------------------------------------------------------------

// The date the Today form is showing. History (Step 8) will reuse the
// same form for past dates by changing this.
let selectedDate = todayKey();

// The saved record for one date (created only when something is recorded)
function dayRecord(key, create) {
  if (!data.days[key] && create) data.days[key] = {};
  return data.days[key];
}

// Each dose is identified by item + scheduled time, e.g. "sup-abc@08:00",
// so two daily doses of the same item are tracked separately.
function doseKey(itemId, time) {
  return itemId + '@' + time;
}

// The current time as "HH:MM"
function currentTime() {
  const now = new Date();
  return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
}

// All doses for a date, earliest first:
// - the doses scheduled for that weekday (from your current Setup), plus
// - any dose already recorded that day, shown from its saved copy.
// A recorded dose always wins, so later Setup changes never alter it.
function dosesForDate(key) {
  const record = dayRecord(key, false);
  const saved = (record && record.doses) || {};

  // Item + time of every recorded dose, so a dose recorded under an older
  // version of a schedule isn't shown a second time under the new version
  const recorded = {};
  Object.keys(saved).forEach(function (id) {
    const dose = saved[id];
    const item = data.settings.supplements.find(function (i) { return i.id === dose.itemId; });
    recorded[(item ? seriesKey(item) : dose.itemId) + '@' + dose.scheduledTime] = true;
  });

  const doses = {};
  supplementsForDate(key).forEach(function (item) {
    item.times.forEach(function (time) {
      const id = doseKey(item.id, time);
      if (!saved[id] && recorded[seriesKey(item) + '@' + time]) return;
      doses[id] = {
        key: id, itemId: item.id, name: item.name, dosage: item.dosage, type: item.type,
        scheduledTime: time, status: null, takenAt: null,
      };
    });
  });

  Object.keys(saved).forEach(function (id) {
    doses[id] = Object.assign({ key: id }, saved[id]);
  });

  return Object.values(doses).sort(function (a, b) {
    return a.scheduledTime.localeCompare(b.scheduledTime) || a.name.localeCompare(b.name);
  });
}

// Change one dose to 'taken', 'missed' or null (= not recorded)
function setDoseStatus(key, id, status) {
  const dose = dosesForDate(key).find(function (d) { return d.key === id; });
  if (!dose) return;

  if (status === null) {
    // Not recorded = no record for this dose
    const record = dayRecord(key, false);
    if (record && record.doses) {
      delete record.doses[id];
      // tidy up so an untouched day doesn't count as "recorded"
      if (Object.keys(record.doses).length === 0) delete record.doses;
      if (Object.keys(record).length === 0) delete data.days[key];
    }
  } else {
    const record = dayRecord(key, true);
    record.doses = record.doses || {};
    // Keep an edited intake time if it was already taken; otherwise use
    // the time right now (or the scheduled time when filling in a past day).
    const takenAt = status === 'taken'
      ? (dose.status === 'taken' && dose.takenAt) || (key === todayKey() ? currentTime() : dose.scheduledTime)
      : null;
    // A full copy of the dose details, so history never changes later
    record.doses[id] = {
      itemId: dose.itemId,
      name: dose.name,
      dosage: dose.dosage,
      type: dose.type,
      scheduledTime: dose.scheduledTime,
      status: status,
      takenAt: takenAt,
      updatedAt: new Date().toISOString(),
    };
  }
  saveData();
  renderTodaySupplements();
}

function setTakenTime(key, id, time) {
  const record = dayRecord(key, false);
  const dose = record && record.doses && record.doses[id];
  if (!dose || !time) { renderTodaySupplements(); return; }
  dose.takenAt = time;
  dose.updatedAt = new Date().toISOString();
  saveData();
  renderTodaySupplements();
}

// "✓ All taken" for every not-yet-recorded dose at one time
function markGroupTaken(key, time) {
  dosesForDate(key)
    .filter(function (d) { return d.scheduledTime === time && d.status === null; })
    .forEach(function (d) { setDoseStatus(key, d.key, 'taken'); });
}

function doseRow(dose) {
  const icon = dose.type === 'medication' ? '💊' : '🌿';
  const statusClass = dose.status ? 'status-' + dose.status : 'status-none';
  const choice = function (value, label) {
    const selected = (dose.status || 'none') === value;
    return '<button type="button" data-status="' + value + '" aria-pressed="' + selected + '">' + label + '</button>';
  };
  return '<div class="dose ' + statusClass + '" data-dose="' + escapeHtml(dose.key) + '">' +
    '<span class="row-title">' + icon + ' ' + escapeHtml(dose.name) +
    (dose.dosage ? ' <span class="row-dose">· ' + escapeHtml(dose.dosage) + '</span>' : '') + '</span>' +
    '<div class="status-buttons" role="group" aria-label="' + escapeHtml(dose.name) + ' at ' + dose.scheduledTime + '">' +
    choice('taken', '✓ Taken') + choice('missed', '✗ Missed') + choice('none', 'Not recorded') +
    '</div>' +
    (dose.status === 'taken'
      ? '<label class="taken-time">Taken at <input type="time" data-taken-time value="' + escapeHtml(dose.takenAt || '') + '"></label>'
      : '') +
    '</div>';
}

function renderTodaySupplements() {
  const key = selectedDate;
  const container = document.getElementById('today-supplements');
  const doses = dosesForDate(key);

  if (doses.length === 0) {
    const hasAnyScheduled = data.settings.supplements.some(function (s) { return s.schedule !== 'prn' && !s.archived; });
    const isPast = key < todayKey();
    container.innerHTML = hasAnyScheduled
      ? '<p class="empty-text">Nothing scheduled for this day.</p>' +
        (isPast ? '<p class="help-text small">Taking something before you added it to the app? Set an earlier “Started on” date for it in ⚙️ Setup.</p>' : '')
      : '<p class="empty-text">No scheduled supplements or medications yet.</p>' +
        '<button type="button" class="small-button" data-open-setup>Add them in Setup</button>';
    return;
  }

  // Daily progress
  const taken = doses.filter(function (d) { return d.status === 'taken'; }).length;
  const missed = doses.filter(function (d) { return d.status === 'missed'; }).length;
  const notRecorded = doses.length - taken - missed;
  const percent = function (n) { return (n / doses.length * 100).toFixed(1) + '%'; };
  let html =
    '<p class="progress-summary"><strong>' + taken + ' of ' + doses.length + '</strong> doses taken</p>' +
    '<div class="progress-bar" aria-hidden="true">' +
      '<span class="bar-taken" style="width:' + percent(taken) + '"></span>' +
      '<span class="bar-missed" style="width:' + percent(missed) + '"></span>' +
    '</div>' +
    '<p class="progress-legend">' +
      '<span class="legend-taken">✓ ' + taken + ' taken</span>' +
      '<span class="legend-missed">✗ ' + missed + ' missed</span>' +
      '<span class="legend-none">' + notRecorded + ' not recorded</span>' +
    '</p>';

  // Doses grouped by scheduled time
  const times = doses.map(function (d) { return d.scheduledTime; })
    .filter(function (t, i, list) { return list.indexOf(t) === i; });
  times.forEach(function (time) {
    const group = doses.filter(function (d) { return d.scheduledTime === time; });
    const open = group.filter(function (d) { return d.status === null; }).length;
    html += '<div class="dose-group">' +
      '<div class="dose-group-header"><h3 class="day-heading">' + time + '</h3>' +
      (open >= 2 ? '<button type="button" class="small-button" data-all-taken="' + time + '">✓ All taken</button>' : '') +
      '</div>' + group.map(doseRow).join('') + '</div>';
  });

  container.innerHTML = html;
}

function renderToday() {
  renderDateBar();
  renderTodaySupplements();
  renderSleepCard();
  renderExerciseCard();
  renderMigraineCard();
  renderPrnCard();
}

// Removes a day's record when nothing is left in it, so an untouched
// day never counts as "recorded"
function removeDayIfEmpty(key) {
  const record = data.days[key];
  if (record && Object.keys(record).length === 0) delete data.days[key];
}


// ------------------------------------------------------------
// MIGRAINES & AS-NEEDED (PRN) MEDICATION INTAKE (Step 8)
//   days[date].migraines  = [{ id, severity, duration, startTime,
//                              prnIntakeIds: [...], helped, notes, ... }]
//   days[date].noMigraine = true          (an explicit migraine-free day)
//   days[date].prnIntakes = [{ id, medicationId, name, dose, time, notes, ... }]
// Each intake is stored once. An episode only keeps the *ids* of the
// intakes taken for it, so nothing is ever copied or counted twice.
// PRN intakes are completely separate from the scheduled checklist.
// ------------------------------------------------------------

const MIGRAINE_DURATIONS = [
  ['<1', '< 1 h'], ['1-4', '1–4 h'], ['4-12', '4–12 h'], ['12-24', '12–24 h'], ['>24', '> 24 h'], ['', 'Not sure'],
];
const HELPED_OPTIONS = [
  ['helped', 'Helped'], ['partial', 'Partially helped'], ['no', 'Did not help'], ['', 'Not recorded'],
];

function migrainesFor(key) {
  const record = dayRecord(key, false);
  return ((record && record.migraines) || []).slice().sort(function (a, b) {
    return (a.startTime || '99').localeCompare(b.startTime || '99') || a.createdAt.localeCompare(b.createdAt);
  });
}
function intakesFor(key) {
  const record = dayRecord(key, false);
  return ((record && record.prnIntakes) || []).slice().sort(function (a, b) {
    return (a.time || '99').localeCompare(b.time || '99') || a.createdAt.localeCompare(b.createdAt);
  });
}
function noMigraineOn(key) {
  const record = dayRecord(key, false);
  return Boolean(record && record.noMigraine);
}

// The episode an intake is linked to (or undefined)
function episodeForIntake(key, intakeId) {
  return migrainesFor(key).find(function (m) { return (m.prnIntakeIds || []).includes(intakeId); });
}

// e.g. "Sumatriptan 50 mg · 14:30"
function intakeLabel(intake) {
  return escapeHtml(intake.name) + (intake.dose ? ' ' + escapeHtml(intake.dose) : '') + (intake.time ? ' · ' + intake.time : '');
}
// e.g. "Severity 7 · 14:00"
function episodeLabel(episode) {
  return 'Severity ' + episode.severity + (episode.startTime ? ' · ' + episode.startTime : '');
}

function toggleNoMigraine(key) {
  const record = dayRecord(key, true);
  if (record.noMigraine) delete record.noMigraine;
  else record.noMigraine = true;
  removeDayIfEmpty(key);
  saveData();
  renderMigraineCard();
}

function renderMigraineCard() {
  const key = selectedDate;
  const episodes = migrainesFor(key);
  const intakes = intakesFor(key);
  const isToday = key === todayKey();
  let html = '';

  if (episodes.length === 0) {
    const none = noMigraineOn(key);
    html += '<button type="button" class="no-migraine" data-no-migraine aria-pressed="' + none + '">' +
      (none ? '✓ ' : '') + (isToday ? 'No migraine today' : 'No migraine on this day') + '</button>';
    html += '<p class="help-text small">' + (none
      ? 'Recorded as a migraine-free day. Tap again to undo.'
      : 'Not recorded yet. Tap above for a migraine-free day, or add an episode.') + '</p>';
  } else {
    html += '<div class="item-list">' + episodes.map(function (episode, index) {
      const linked = (episode.prnIntakeIds || [])
        .map(function (id) { return intakes.find(function (i) { return i.id === id; }); })
        .filter(Boolean);
      const details = [
        episode.duration ? optionLabelFromPairs(MIGRAINE_DURATIONS, episode.duration) : 'Duration not recorded',
        episode.startTime ? 'from ' + episode.startTime : '',
      ].filter(Boolean).join(' · ');
      const treatment = linked.length
        ? '💊 ' + linked.map(intakeLabel).join(', ') + ' · ' +
          (episode.helped ? optionLabelFromPairs(HELPED_OPTIONS, episode.helped) : 'effect not recorded')
        : 'No as-needed medication linked';
      return '<button type="button" class="list-row migraine-row severity-' + severityBand(episode.severity) + '" data-migraine="' + escapeHtml(episode.id) + '">' +
        '<span class="row-title">' + (episodes.length > 1 ? 'Episode ' + (index + 1) + ' · ' : '') +
        'Severity ' + episode.severity + '/10</span>' +
        '<span class="row-sub">' + details + '</span>' +
        '<span class="row-sub">' + treatment + '</span>' +
        (episode.notes ? '<span class="row-sub">' + escapeHtml(episode.notes) + '</span>' : '') +
        '</button>';
    }).join('') + '</div>';
  }
  html += '<button type="button" class="button add-extra" data-add-migraine>+ Add migraine episode</button>';
  document.getElementById('today-migraine').innerHTML = html;
}

function severityBand(severity) {
  return severity >= 7 ? 'high' : severity >= 4 ? 'mid' : 'low';
}

function optionLabelFromPairs(pairs, value) {
  const pair = pairs.find(function (p) { return p[0] === value; });
  return pair ? pair[1] : value;
}

function renderPrnCard() {
  const key = selectedDate;
  const intakes = intakesFor(key);
  let html = '<p class="help-text">Only what you actually took. These never count as missed doses.</p>';
  if (intakes.length) {
    html += '<div class="item-list">' + intakes.map(function (intake) {
      const episode = episodeForIntake(key, intake.id);
      return '<button type="button" class="list-row" data-intake="' + escapeHtml(intake.id) + '">' +
        '<span class="row-title">💊 ' + intakeLabel(intake) + '</span>' +
        '<span class="row-sub">' + (episode ? '⚡ For migraine (' + episodeLabel(episode) + ')' : 'Not linked to a migraine') + '</span>' +
        (intake.notes ? '<span class="row-sub">' + escapeHtml(intake.notes) + '</span>' : '') +
        '</button>';
    }).join('') + '</div>';
  } else {
    html += '<p class="empty-text">No as-needed medication logged for this day.</p>';
  }
  html += '<button type="button" class="button add-extra" data-add-intake>+ Log as-needed medication</button>';
  if (prnMedications().length === 0) {
    html += '<p class="help-text small">Tip: add your as-needed medications in ⚙️ Setup (choose “As needed (PRN)”) to pick them with one tap.</p>';
  }
  document.getElementById('today-prn').innerHTML = html;
}


// --- Migraine episode form ---

const migraineDialog = document.getElementById('migraine-dialog');
const migraineForm = document.getElementById('migraine-form');
let editingMigraine = null;   // { key, id }

buildChoices('severity-choices', 'radio', 'severity',
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { return { value: n, label: String(n) }; }));
buildChoices('migraine-duration-choices', 'radio', 'migraineDuration',
  MIGRAINE_DURATIONS.map(function (p) { return { value: p[0], label: p[1] }; }));
buildChoices('helped-choices', 'radio', 'helped',
  HELPED_OPTIONS.map(function (p) { return { value: p[0], label: p[1] }; }));

// "Did the treatment help?" only when a medication is linked
function updateHelpedField() {
  const anyLinked = migraineForm.querySelectorAll('input[name="linkIntake"]:checked').length > 0;
  document.getElementById('helped-field').hidden = !anyLinked;
}

function openMigraineForm(id) {
  const key = selectedDate;
  const episode = migrainesFor(key).find(function (m) { return m.id === id; });
  editingMigraine = { key: key, id: episode ? episode.id : null };

  migraineForm.reset();
  hideFormError(migraineForm);
  document.getElementById('migraine-dialog-title').textContent = episode ? 'Edit migraine episode' : 'Add migraine episode';
  document.getElementById('migraine-dialog-date').textContent = formatLongDate(key);

  // the day's intakes, ticked when linked to this episode
  const intakes = intakesFor(key);
  document.getElementById('link-choices').innerHTML = intakes.map(function (intake) {
    const other = episodeForIntake(key, intake.id);
    const linkedHere = episode && other && other.id === episode.id;
    const note = other && !linkedHere ? ' <small>(now linked to another episode)</small>' : '';
    return '<label class="chip"><input type="checkbox" name="linkIntake" value="' + escapeHtml(intake.id) + '"' +
      (linkedHere ? ' checked' : '') + '><span>💊 ' + intakeLabel(intake) + note + '</span></label>';
  }).join('');
  document.getElementById('link-hint').textContent = intakes.length
    ? 'Tick what you took for this episode.'
    : 'No as-needed medication logged for this day yet. Log it in the “As-needed medications” card and link it there.';

  if (episode) {
    migraineForm.elements.severity.value = String(episode.severity);
    migraineForm.elements.migraineDuration.value = episode.duration || '';
    migraineForm.elements.startTime.value = episode.startTime || '';
    migraineForm.elements.helped.value = episode.helped || '';
    migraineForm.elements.notes.value = episode.notes || '';
  } else {
    migraineForm.elements.helped.value = '';
  }
  updateHelpedField();
  document.getElementById('remove-migraine-button').hidden = !episode;
  migraineDialog.showModal();
}

function saveMigraineForm(event) {
  event.preventDefault();
  const fields = migraineForm.elements;
  const severity = Number(fields.severity.value);
  if (!severity) return showFormError(migraineForm, 'Please choose a severity from 1 to 10.');

  const linkedIds = Array.from(migraineForm.querySelectorAll('input[name="linkIntake"]:checked'))
    .map(function (box) { return box.value; });
  const key = editingMigraine.key;
  const now = new Date().toISOString();
  const record = dayRecord(key, true);
  record.migraines = record.migraines || [];

  // an intake belongs to one episode at most: unlink it from any other
  record.migraines.forEach(function (m) {
    if (m.id !== editingMigraine.id) {
      m.prnIntakeIds = (m.prnIntakeIds || []).filter(function (id) { return !linkedIds.includes(id); });
      if (m.prnIntakeIds.length === 0) m.helped = null;
    }
  });

  const values = {
    severity: severity,
    duration: fields.migraineDuration.value || null,
    startTime: fields.startTime.value || null,
    prnIntakeIds: linkedIds,
    helped: linkedIds.length ? (fields.helped.value || null) : null,
    notes: fields.notes.value.trim(),
    updatedAt: now,
  };
  const existing = record.migraines.find(function (m) { return m.id === editingMigraine.id; });
  if (existing) Object.assign(existing, values);
  else record.migraines.push(Object.assign({ id: newId('mig'), createdAt: now }, values));

  delete record.noMigraine;   // an episode means it wasn't a migraine-free day
  saveData();
  migraineDialog.close();
  renderMigraineCard();
  renderPrnCard();
}

function removeMigraineFromForm() {
  const key = editingMigraine.key;
  const record = dayRecord(key, false);
  const list = (record && record.migraines) || [];
  const index = list.findIndex(function (m) { return m.id === editingMigraine.id; });
  if (index === -1) return;
  const ok = confirm('Remove this migraine episode?\n\n' + episodeLabel(list[index]) + '\n' + formatLongDate(key) +
    '\n\nAny medication logged for it stays in the As-needed medications list.');
  if (!ok) return;
  list.splice(index, 1);
  if (list.length === 0) delete record.migraines;
  removeDayIfEmpty(key);
  saveData();
  migraineDialog.close();
  renderMigraineCard();
  renderPrnCard();
}


// --- As-needed medication intake form ---

const intakeDialog = document.getElementById('intake-dialog');
const intakeForm = document.getElementById('intake-form');
let editingIntake = null;   // { key, id }
let autoFilledDose = '';    // the usual dosage we filled in, so we can replace it

// The chosen option of a group of tap-to-choose buttons ('' when none).
// (Read directly, because a group with a single option behaves oddly.)
function checkedValue(form, name) {
  const input = form.querySelector('input[name="' + name + '"]:checked');
  return input ? input.value : '';
}
function setChecked(form, name, value) {
  form.querySelectorAll('input[name="' + name + '"]').forEach(function (input) {
    input.checked = input.value === value;
  });
}

function showOtherName() {
  intakeForm.elements.otherName.hidden = checkedValue(intakeForm, 'intakeMed') !== 'other';
}

// When a medication is chosen, fill in its usual dosage (unless you typed your own)
function fillUsualDose() {
  const chosen = checkedValue(intakeForm, 'intakeMed');
  const med = prnMedications().find(function (m) { return seriesKey(m) === chosen; });
  const doseField = intakeForm.elements.dose;
  if (doseField.value === '' || doseField.value === autoFilledDose) {
    autoFilledDose = med ? med.dosage || '' : '';
    doseField.value = autoFilledDose;
  }
}

function openIntakeForm(id) {
  const key = selectedDate;
  const intake = intakesFor(key).find(function (i) { return i.id === id; });
  editingIntake = { key: key, id: intake ? intake.id : null };

  intakeForm.reset();
  hideFormError(intakeForm);
  autoFilledDose = '';
  document.getElementById('intake-dialog-title').textContent = intake ? 'Edit as-needed medication' : 'Log as-needed medication';
  document.getElementById('intake-dialog-date').textContent = formatLongDate(key);

  // medication choices: your active as-needed medications (+ an archived one
  // if this intake used it), then "Other"
  const options = prnMedications().map(function (m) {
    return { value: seriesKey(m), label: '💊 ' + escapeHtml(m.name) + (m.dosage ? ' <small>' + escapeHtml(m.dosage) + '</small>' : '') };
  });
  if (intake && intake.medicationId && !options.some(function (o) { return o.value === intake.medicationId; })) {
    options.push({ value: intake.medicationId, label: '💊 ' + escapeHtml(intake.name) });
  }
  options.push({ value: 'other', label: 'Other…' });
  document.getElementById('intake-med-choices').innerHTML = options.map(function (o) {
    return '<label class="chip"><input type="radio" name="intakeMed" value="' + escapeHtml(o.value) + '"><span>' + o.label + '</span></label>';
  }).join('');

  // which migraine episode it was for (if any)
  const episodes = migrainesFor(key);
  document.getElementById('intake-episode-field').hidden = episodes.length === 0;
  document.getElementById('intake-episode-choices').innerHTML =
    '<label class="chip"><input type="radio" name="intakeEpisode" value=""><span>Not for a migraine</span></label>' +
    episodes.map(function (m) {
      return '<label class="chip"><input type="radio" name="intakeEpisode" value="' + escapeHtml(m.id) + '"><span>⚡ ' + episodeLabel(m) + '</span></label>';
    }).join('');

  if (intake) {
    setChecked(intakeForm, 'intakeMed', intake.medicationId || 'other');
    if (!intake.medicationId) intakeForm.elements.otherName.value = intake.name;
    intakeForm.elements.dose.value = intake.dose || '';
    intakeForm.elements.time.value = intake.time || '';
    intakeForm.elements.notes.value = intake.notes || '';
    const episode = episodeForIntake(key, intake.id);
    setChecked(intakeForm, 'intakeEpisode', episode ? episode.id : '');
  } else {
    if (key === todayKey()) intakeForm.elements.time.value = currentTime();
    if (prnMedications().length === 1) {   // only one choice: pick it
      setChecked(intakeForm, 'intakeMed', seriesKey(prnMedications()[0]));
      fillUsualDose();
    }
    // a new intake on a day with exactly one episode is most likely for it
    setChecked(intakeForm, 'intakeEpisode', episodes.length === 1 ? episodes[0].id : '');
  }
  showOtherName();
  document.getElementById('remove-intake-button').hidden = !intake;
  intakeDialog.showModal();
}

function saveIntakeForm(event) {
  event.preventDefault();
  const fields = intakeForm.elements;
  const choice = checkedValue(intakeForm, 'intakeMed');
  if (!choice) return showFormError(intakeForm, 'Please choose a medication.');

  let name;
  let medicationId = null;
  if (choice === 'other') {
    name = fields.otherName.value.trim();
    if (!name) return showFormError(intakeForm, 'Please type the medication name.');
  } else {
    const med = currentVersions(data.settings.supplements).find(function (m) { return seriesKey(m) === choice; });
    const existingIntake = intakesFor(editingIntake.key).find(function (i) { return i.id === editingIntake.id; });
    medicationId = choice;
    name = med ? med.name : (existingIntake ? existingIntake.name : choice);
  }

  const key = editingIntake.key;
  const now = new Date().toISOString();
  const record = dayRecord(key, true);
  record.prnIntakes = record.prnIntakes || [];
  const values = {
    medicationId: medicationId,
    name: name,                      // kept as a copy, so renaming later doesn't change history
    dose: fields.dose.value.trim(),
    time: fields.time.value || null,
    notes: fields.notes.value.trim(),
    updatedAt: now,
  };
  let intake = record.prnIntakes.find(function (i) { return i.id === editingIntake.id; });
  if (intake) Object.assign(intake, values);
  else {
    intake = Object.assign({ id: newId('prn'), createdAt: now }, values);
    record.prnIntakes.push(intake);
  }

  // link to the chosen episode (and only that one)
  const episodeId = checkedValue(intakeForm, 'intakeEpisode');
  (record.migraines || []).forEach(function (m) {
    m.prnIntakeIds = (m.prnIntakeIds || []).filter(function (id) { return id !== intake.id; });
    if (m.id === episodeId) m.prnIntakeIds.push(intake.id);
    if (m.prnIntakeIds.length === 0) m.helped = null;   // no treatment linked any more
  });

  saveData();
  intakeDialog.close();
  renderMigraineCard();
  renderPrnCard();
}

function removeIntakeFromForm() {
  const key = editingIntake.key;
  const record = dayRecord(key, false);
  const list = (record && record.prnIntakes) || [];
  const index = list.findIndex(function (i) { return i.id === editingIntake.id; });
  if (index === -1) return;
  const intake = list[index];
  const ok = confirm('Remove this as-needed medication entry?\n\n' + intake.name + (intake.dose ? ' ' + intake.dose : '') +
    (intake.time ? ' at ' + intake.time : '') + '\n' + formatLongDate(key));
  if (!ok) return;
  list.splice(index, 1);
  if (list.length === 0) delete record.prnIntakes;
  (record.migraines || []).forEach(function (m) {
    m.prnIntakeIds = (m.prnIntakeIds || []).filter(function (id) { return id !== intake.id; });
    if (m.prnIntakeIds.length === 0) m.helped = null;   // nothing linked any more
  });
  removeDayIfEmpty(key);
  saveData();
  intakeDialog.close();
  renderMigraineCard();
  renderPrnCard();
}


// ------------------------------------------------------------
// EXERCISE (Step 7)
// Planned sessions come from the weekly schedule in Setup (the version
// that applied on the selected date). Each one is Completed, Not
// completed, or Not recorded (= no entry). Unplanned workouts are a
// separate list for the day.
//   days[date].workouts[planId] = { planId, seriesId, type, timeOfDay,
//                                   status, minutes, notes, updatedAt }
//   days[date].extraWorkouts = [{ id, type, timeOfDay, minutes, notes, ... }]
// ------------------------------------------------------------

const QUICK_MINUTES = [30, 45, 60, 90];

function workoutLabel(type) {
  return optionLabel(WORKOUT_TYPES, type);
}

// Planned sessions for a date: from the schedule that applied then, plus
// anything already recorded (shown from its saved copy, so later schedule
// changes never alter it)
function sessionsForDate(key) {
  const record = dayRecord(key, false);
  const saved = (record && record.workouts) || {};

  const recordedSeries = {};
  Object.keys(saved).forEach(function (id) { recordedSeries[saved[id].seriesId || id] = true; });

  const sessions = {};
  workoutsForDate(key).forEach(function (plan) {
    if (!saved[plan.id] && recordedSeries[seriesKey(plan)]) return;   // already recorded under an older version
    sessions[plan.id] = {
      planId: plan.id, seriesId: seriesKey(plan), type: plan.type, timeOfDay: plan.timeOfDay,
      status: null, minutes: null, notes: '',
    };
  });
  Object.keys(saved).forEach(function (id) {
    sessions[id] = Object.assign({ planId: id }, saved[id]);
  });

  return Object.values(sessions).sort(function (a, b) {
    return timeOfDayOrder(a.timeOfDay) - timeOfDayOrder(b.timeOfDay) || a.type.localeCompare(b.type);
  });
}

function extrasFor(key) {
  const record = dayRecord(key, false);
  return (record && record.extraWorkouts) || [];
}

// status: 'completed', 'not_completed' or null (= not recorded)
function setSessionStatus(key, planId, status) {
  const session = sessionsForDate(key).find(function (s) { return s.planId === planId; });
  if (!session) return;

  if (status === null) {
    const record = dayRecord(key, false);
    if (record && record.workouts) {
      delete record.workouts[planId];
      if (Object.keys(record.workouts).length === 0) delete record.workouts;
      removeDayIfEmpty(key);
    }
  } else {
    const record = dayRecord(key, true);
    record.workouts = record.workouts || {};
    record.workouts[planId] = {
      planId: planId,
      seriesId: session.seriesId,
      type: session.type,
      timeOfDay: session.timeOfDay,
      status: status,
      // minutes only make sense for a completed workout; notes are kept either way
      minutes: status === 'completed' && session.status === 'completed' ? session.minutes : null,
      notes: session.notes || '',
      updatedAt: new Date().toISOString(),
    };
  }
  saveData();
  renderExerciseCard();
}

// Minutes or notes typed for a recorded session (saved as you type)
function setSessionDetail(key, planId, field, value) {
  const record = dayRecord(key, false);
  const entry = record && record.workouts && record.workouts[planId];
  if (!entry) return;
  entry[field] = value;
  entry.updatedAt = new Date().toISOString();
  saveData();
}

// A number of minutes from a text box (null when empty or not sensible)
function readMinutes(text) {
  const minutes = parseInt(text, 10);
  return minutes >= 1 && minutes <= 600 ? minutes : null;
}

function minuteChips(selected, attribute) {
  return QUICK_MINUTES.map(function (m) {
    return '<button type="button" class="choice" ' + attribute + '="' + m + '" aria-pressed="' + (selected === m) + '">' + m + '</button>';
  }).join('');
}

function sessionRow(session) {
  const choice = function (value, label) {
    const selected = (session.status || 'none') === value;
    return '<button type="button" data-session-status="' + value + '" aria-pressed="' + selected + '">' + label + '</button>';
  };
  let html = '<div class="dose session status-' + (session.status || 'none') + '" data-plan="' + escapeHtml(session.planId) + '">' +
    '<span class="row-title">' + workoutLabel(session.type) +
    ' <span class="row-dose">· ' + optionLabel(TIMES_OF_DAY, session.timeOfDay) + '</span></span>' +
    '<div class="status-buttons" role="group" aria-label="' + workoutLabel(session.type) + '">' +
    choice('completed', '✓ Completed') + choice('not_completed', '✗ Not completed') + choice('none', 'Not recorded') +
    '</div>';

  if (session.status === 'completed') {
    html += '<div class="session-details"><span class="mini-label">Minutes</span><div class="minutes-row">' +
      '<input type="number" inputmode="numeric" min="1" max="600" placeholder="min" data-session-minutes aria-label="Minutes" value="' +
      (session.minutes || '') + '">' +
      '<div class="choice-row">' + minuteChips(session.minutes, 'data-session-quick') + '</div></div></div>';
  }
  if (session.status) {
    html += '<input type="text" class="session-notes" maxlength="200" data-session-notes placeholder="Notes (optional)" value="' +
      escapeHtml(session.notes || '') + '">';
  }
  return html + '</div>';
}

function extraRow(extra) {
  return '<button type="button" class="list-row extra-row" data-extra="' + escapeHtml(extra.id) + '">' +
    '<span class="row-title">' + workoutLabel(extra.type) +
    ' <span class="row-dose">· ' + optionLabel(TIMES_OF_DAY, extra.timeOfDay) + '</span></span>' +
    '<span class="row-sub">' + extra.minutes + ' min' + (extra.notes ? ' · ' + escapeHtml(extra.notes) : '') + '</span></button>';
}

function renderExerciseCard() {
  const key = selectedDate;
  const sessions = sessionsForDate(key);
  const extras = extrasFor(key);
  const completed = sessions.filter(function (s) { return s.status === 'completed'; }).length;
  const notCompleted = sessions.filter(function (s) { return s.status === 'not_completed'; }).length;
  const notRecorded = sessions.length - completed - notCompleted;

  let html = '';

  // Planned
  html += '<h3 class="section-heading first">Planned</h3>';
  if (sessions.length) {
    html += '<p class="progress-legend">' +
      '<span class="legend-taken">✓ ' + completed + ' of ' + sessions.length + ' completed</span>' +
      '<span class="legend-missed">✗ ' + notCompleted + ' not completed</span>' +
      '<span class="legend-none">' + notRecorded + ' not recorded</span></p>';
    html += sessions.map(sessionRow).join('');
  } else {
    const anyPlan = data.settings.workoutPlan.some(function (w) { return !w.archived; });
    html += anyPlan
      ? '<p class="empty-text">No workouts planned for this day.</p>'
      : '<p class="empty-text">No weekly workout schedule yet.</p>' +
        '<button type="button" class="small-button" data-open-setup>Plan workouts in Setup</button>';
  }

  // Unplanned
  html += '<h3 class="section-heading">Unplanned' + (extras.length ? ' (' + extras.length + ')' : '') + '</h3>';
  html += extras.length ? '<div class="item-list">' + extras.map(extraRow).join('') + '</div>' : '';
  html += '<button type="button" class="button add-extra" data-add-extra>+ Add unplanned workout</button>';

  document.getElementById('today-exercise').innerHTML = html;
}


// --- Unplanned workout form ---

const extraDialog = document.getElementById('extra-dialog');
const extraForm = document.getElementById('extra-form');
let editingExtra = null;   // { key, id } while editing; { key } while adding

buildChoices('extra-type-choices', 'radio', 'extraType', WORKOUT_TYPES);
buildChoices('extra-time-choices', 'radio', 'extraTimeOfDay', TIMES_OF_DAY);
document.getElementById('extra-minute-choices').innerHTML = minuteChips(null, 'data-extra-quick');

function updateExtraMinuteChips() {
  const minutes = readMinutes(extraForm.elements.minutes.value);
  extraForm.querySelectorAll('[data-extra-quick]').forEach(function (chip) {
    chip.setAttribute('aria-pressed', String(Number(chip.dataset.extraQuick) === minutes));
  });
}

function openExtraForm(id) {
  const key = selectedDate;
  const extra = extrasFor(key).find(function (e) { return e.id === id; });
  editingExtra = { key: key, id: extra ? extra.id : null };

  extraForm.reset();
  hideFormError(extraForm);
  document.getElementById('extra-dialog-title').textContent = extra ? 'Edit unplanned workout' : 'Add unplanned workout';
  document.getElementById('extra-dialog-date').textContent = formatLongDate(key);
  if (extra) {
    extraForm.elements.extraType.value = extra.type;
    extraForm.elements.extraTimeOfDay.value = extra.timeOfDay;
    extraForm.elements.minutes.value = extra.minutes;
    extraForm.elements.notes.value = extra.notes || '';
  } else if (key === todayKey()) {
    // for today, guess the time of day from the clock (easy to change)
    const hour = new Date().getHours();
    extraForm.elements.extraTimeOfDay.value = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  }
  updateExtraMinuteChips();
  document.getElementById('remove-extra-button').hidden = !extra;
  extraDialog.showModal();
}

function saveExtraForm(event) {
  event.preventDefault();
  const fields = extraForm.elements;
  const type = fields.extraType.value;
  const timeOfDay = fields.extraTimeOfDay.value;
  const minutes = readMinutes(fields.minutes.value);
  const notes = fields.notes.value.trim();

  if (!type) return showFormError(extraForm, 'Please choose a workout.');
  if (!timeOfDay) return showFormError(extraForm, 'Please choose a time of day.');
  if (!minutes) return showFormError(extraForm, 'Please enter the duration in minutes (1–600).');

  const key = editingExtra.key;
  const now = new Date().toISOString();
  const record = dayRecord(key, true);
  record.extraWorkouts = record.extraWorkouts || [];
  const existing = record.extraWorkouts.find(function (e) { return e.id === editingExtra.id; });
  if (existing) {
    Object.assign(existing, { type: type, timeOfDay: timeOfDay, minutes: minutes, notes: notes, updatedAt: now });
  } else {
    record.extraWorkouts.push({
      id: newId('ex'), type: type, timeOfDay: timeOfDay, minutes: minutes, notes: notes,
      createdAt: now, updatedAt: now,
    });
  }
  saveData();
  extraDialog.close();
  renderExerciseCard();
}

function removeExtraFromForm() {
  const key = editingExtra.key;
  const record = dayRecord(key, false);
  const list = (record && record.extraWorkouts) || [];
  const index = list.findIndex(function (e) { return e.id === editingExtra.id; });
  if (index === -1) return;
  const extra = list[index];
  const ok = confirm('Remove this unplanned workout?\n\n' + workoutLabel(extra.type) + ' · ' +
    optionLabel(TIMES_OF_DAY, extra.timeOfDay) + ' · ' + extra.minutes + ' min\n' + formatLongDate(key));
  if (!ok) return;
  list.splice(index, 1);
  if (list.length === 0) delete record.extraWorkouts;
  removeDayIfEmpty(key);
  saveData();
  extraDialog.close();
  renderExerciseCard();
}


// ------------------------------------------------------------
// SLEEP & SYMPTOMS (Step 6)
// A quick morning check-in, saved under the date you wake up.
// Every answer is optional: no answer = "not recorded", while
// "None" is a real answer. Tapping a chosen answer again clears it.
// ------------------------------------------------------------

const SEVERITY = [
  ['none', 'None'], ['mild', 'Mild'], ['moderate', 'Moderate'], ['severe', 'Severe'],
];
const SLEEP_QUESTIONS = {
  duration: {
    label: 'Total sleep',
    options: [['<5', '< 5 h'], ['5-6', '5–6 h'], ['6-7', '6–7 h'], ['7-8', '7–8 h'], ['>8', '> 8 h']],
  },
  awakenings: {
    label: 'Night awakenings',
    options: [['none', 'None'], ['1', 'Once'], ['2-3', '2–3'], ['4+', '4+']],
  },
  fallBackAsleep: {
    label: 'Minutes to fall back asleep (longest awakening)',
    options: [['<15', '< 15'], ['15-30', '15–30'], ['30-60', '30–60'], ['>60', '> 60'], ['unable', 'Unable']],
  },
  quality: {
    label: 'Sleep quality',
    options: [['good', '😊 Good'], ['average', '😐 Average'], ['poor', '😣 Poor']],
  },
  nightSweats: { label: 'Night sweats', options: SEVERITY },
  hotFlashes: { label: 'Hot flashes', options: SEVERITY },
};

function sleepFor(key) {
  const record = dayRecord(key, false);
  return (record && record.sleep) || {};
}

// "Time to fall back asleep" only applies when you woke up at night
function hadAwakenings(sleep) {
  return Boolean(sleep.awakenings) && sleep.awakenings !== 'none';
}

// Save one answer (null = clear it back to "not recorded")
function setSleepValue(key, field, value) {
  const record = dayRecord(key, true);
  const sleep = record.sleep || {};
  if (value === null || value === '') delete sleep[field];
  else sleep[field] = value;
  if (!hadAwakenings(sleep)) delete sleep.fallBackAsleep;

  const hasAnswers = Object.keys(sleep).some(function (k) { return k !== 'updatedAt'; });
  if (hasAnswers) {
    sleep.updatedAt = new Date().toISOString();
    record.sleep = sleep;
  } else {
    delete record.sleep;
  }
  if (Object.keys(record).length === 0) delete data.days[key];   // nothing left for this day
  saveData();
}

function sleepQuestion(sleep, field) {
  const question = SLEEP_QUESTIONS[field];
  return '<div class="question"><p class="question-label">' + question.label + '</p>' +
    '<div class="choice-row">' + question.options.map(function (option) {
      return '<button type="button" class="choice" data-sleep="' + field + '" data-value="' + option[0] + '" aria-pressed="' +
        (sleep[field] === option[0]) + '">' + option[1] + '</button>';
    }).join('') + '</div></div>';
}

function renderSleepCard() {
  const key = selectedDate;
  const sleep = sleepFor(key);
  const night = keyToDate(addDays(key, -1)).toLocaleDateString('en-US', { weekday: 'short' }) + ' → ' +
    keyToDate(key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  // how many questions have an answer (notes not counted)
  const fields = ['duration', 'awakenings', 'wakeTime', 'quality', 'nightSweats', 'hotFlashes'];
  if (hadAwakenings(sleep)) fields.splice(2, 0, 'fallBackAsleep');
  const answered = fields.filter(function (f) { return sleep[f]; }).length;

  let html = '<p class="help-text">Night of ' + night + ' · <span class="answered">' +
    answered + ' of ' + fields.length + ' answered</span></p>';
  html += sleepQuestion(sleep, 'duration');
  html += sleepQuestion(sleep, 'awakenings');
  if (hadAwakenings(sleep)) html += sleepQuestion(sleep, 'fallBackAsleep');
  html += '<div class="question"><p class="question-label">Wake-up time</p><div class="time-answer">' +
    '<input type="time" data-sleep-time aria-label="Wake-up time" value="' + escapeHtml(sleep.wakeTime || '') + '">' +
    (sleep.wakeTime ? '<button type="button" class="link-button" data-sleep-clear="wakeTime">Clear</button>' : '') +
    '</div></div>';
  html += sleepQuestion(sleep, 'quality');
  html += '<h3 class="section-heading">Symptoms</h3>';
  html += sleepQuestion(sleep, 'nightSweats');
  html += sleepQuestion(sleep, 'hotFlashes');
  html += '<div class="question"><p class="question-label">Notes <span class="optional">(optional)</span></p>' +
    '<textarea data-sleep-notes rows="2" maxlength="500" placeholder="e.g. a hot flash woke me at 3 am">' +
    escapeHtml(sleep.notes || '') + '</textarea></div>';
  html += '<p class="help-text small">Tap a chosen answer again to clear it.</p>';

  document.getElementById('today-sleep').innerHTML = html;
}


// ------------------------------------------------------------
// DATE NAVIGATION in the Daily Log (Step 5)
// The selected date lives only in memory, so opening or reloading
// the app always starts on today.
// ------------------------------------------------------------

function addDays(key, amount) {
  const date = keyToDate(key);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

// e.g. "Tuesday, Nov 10" (adds the year when it isn't this year)
function formatLongDate(key) {
  const date = keyToDate(key);
  const options = { weekday: 'long', month: 'short', day: 'numeric' };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
  return date.toLocaleDateString('en-US', options);
}

function renderDateBar() {
  const today = todayKey();
  const isToday = selectedDate === today;
  const label = isToday ? 'Today' : selectedDate === addDays(today, -1) ? 'Yesterday' : 'Past day';

  document.getElementById('date-label').textContent = label;
  document.getElementById('date-sub').textContent = formatLongDate(selectedDate);
  document.getElementById('date-bar').classList.toggle('past', !isToday);
  document.getElementById('past-row').hidden = isToday;
  document.getElementById('next-day').disabled = isToday;                         // no future dates
  document.getElementById('prev-day').disabled = selectedDate <= EARLIEST_DATE;   // nothing before Oct 1, 2026

  const picker = document.getElementById('date-picker');
  picker.min = EARLIEST_DATE;
  picker.max = today;
  picker.value = selectedDate;
}

function goToDate(key) {
  if (!key) return;
  saveNoteNow();   // a note being typed belongs to the date it was typed on
  const today = todayKey();
  // keep the date between October 1, 2026 and today
  selectedDate = key > today ? today : key < EARLIEST_DATE ? EARLIEST_DATE : key;
  document.getElementById('new-day-banner').hidden = true;
  renderToday();
}

// If the calendar day changes while the app is open, say so clearly and
// offer to switch – never switch silently.
let knownToday = todayKey();
function checkForNewDay() {
  const now = todayKey();
  if (now === knownToday) return;
  knownToday = now;
  if (selectedDate !== now) {
    document.getElementById('new-day-text').textContent =
      'It\'s now ' + formatLongDate(now) + '. You are viewing ' + formatLongDate(selectedDate) + '.';
    document.getElementById('new-day-banner').hidden = false;
  }
  if (!document.getElementById('screen-today').hidden) renderToday();
}


// ------------------------------------------------------------
// HISTORY (Step 9)
// A read-only overview built from the same daily records the Daily Log
// uses – nothing new is stored. Tapping a day opens it in the Daily Log.
// Grey italic = not recorded; red = an explicit negative answer.
// ------------------------------------------------------------

function notRecorded(text) { return '<span class="h-none">' + (text || 'Not recorded') + '</span>'; }
function negative(text) { return '<span class="h-neg">' + text + '</span>'; }
function positive(text) { return '<span class="h-pos">' + text + '</span>'; }

function historyLine(icon, label, content) {
  return '<div class="h-line"><span class="h-icon">' + icon + '</span><span class="h-label">' + label + '</span>' +
    '<span class="h-text">' + content + '</span></div>';
}

function supplementsSummary(key) {
  const doses = dosesForDate(key);
  if (doses.length === 0) return notRecorded('Nothing scheduled');
  const taken = doses.filter(function (d) { return d.status === 'taken'; }).length;
  const missed = doses.filter(function (d) { return d.status === 'missed'; }).length;
  const open = doses.length - taken - missed;
  if (taken + missed === 0) return notRecorded('Not recorded (' + count(doses.length, 'dose', 'doses') + ')');
  return [
    taken ? positive('✓ ' + taken + ' taken') : '',
    missed ? negative('✗ ' + missed + ' missed') : '',
    open ? notRecorded(open + ' not recorded') : '',
  ].filter(Boolean).join(' · ');
}

const AWAKENING_TEXT = { none: 'no awakenings', '1': 'woke once', '2-3': 'woke 2–3×', '4+': 'woke 4+×' };

function sleepSummary(key) {
  const sleep = sleepFor(key);
  const parts = [];
  if (sleep.duration) parts.push(optionLabelFromPairs(SLEEP_QUESTIONS.duration.options, sleep.duration));
  if (sleep.quality) parts.push(optionLabelFromPairs(SLEEP_QUESTIONS.quality.options, sleep.quality));
  if (sleep.awakenings) parts.push(AWAKENING_TEXT[sleep.awakenings]);
  if (sleep.fallBackAsleep) {
    parts.push(sleep.fallBackAsleep === 'unable'
      ? 'couldn’t fall back asleep'
      : optionLabelFromPairs(SLEEP_QUESTIONS.fallBackAsleep.options, sleep.fallBackAsleep) + ' min to fall back asleep');
  }
  return parts.length ? escapeHtml(parts.join(' · ')) : notRecorded();
}

function symptomsSummary(key) {
  const sleep = sleepFor(key);
  const level = function (value) { return optionLabelFromPairs(SEVERITY, value); };
  const parts = [];
  if (sleep.hotFlashes) parts.push('Hot flashes: ' + level(sleep.hotFlashes));
  if (sleep.nightSweats) parts.push('Night sweats: ' + level(sleep.nightSweats));
  return parts.length ? parts.join(' · ') : notRecorded();
}

function exerciseSummary(key) {
  const sessions = sessionsForDate(key);
  const extras = extrasFor(key);
  const parts = [];
  if (sessions.length) {
    const done = sessions.filter(function (s) { return s.status === 'completed'; }).length;
    const notDone = sessions.filter(function (s) { return s.status === 'not_completed'; }).length;
    const open = sessions.length - done - notDone;
    if (done + notDone === 0) {
      parts.push(notRecorded(count(sessions.length, 'planned session', 'planned sessions') + ' not recorded'));
    } else {
      if (done) parts.push(positive('✓ ' + done + ' of ' + sessions.length + ' planned done'));
      if (notDone) parts.push(negative('✗ ' + notDone + ' of ' + sessions.length + ' not completed'));
      if (open) parts.push(notRecorded(open + ' not recorded'));
    }
  }
  if (extras.length) {
    const minutes = extras.reduce(function (sum, e) { return sum + (e.minutes || 0); }, 0);
    parts.push(positive('+ ' + count(extras.length, 'unplanned', 'unplanned') + ' (' + minutes + ' min)'));
  }
  return parts.length ? parts.join(' · ') : notRecorded('Nothing planned');
}

function migraineSummary(key) {
  const episodes = migrainesFor(key);
  if (episodes.length) {
    const severities = episodes.map(function (m) { return m.severity; });
    return negative(count(episodes.length, 'episode', 'episodes') + ' · severity ' + severities.join(', '));
  }
  if (noMigraineOn(key)) return positive('✓ No migraine');
  return notRecorded();
}

// Only shown when something was taken (there is no "none" answer for PRN)
function prnSummary(key) {
  return intakesFor(key).map(function (intake) {
    const episode = episodeForIntake(key, intake.id);
    const effect = episode
      ? (episode.helped ? ' (' + optionLabelFromPairs(HELPED_OPTIONS, episode.helped).toLowerCase() + ')' : ' (for migraine)')
      : '';
    return escapeHtml(intake.name) + (intake.dose ? ' ' + escapeHtml(intake.dose) : '') + effect;
  }).join(', ');
}

function historyCard(key) {
  const today = todayKey();
  const relative = key === today ? 'Today' : key === addDays(today, -1) ? 'Yesterday' : '';
  const prn = prnSummary(key);
  return '<button type="button" class="history-day' + (key === selectedDate ? ' selected' : '') + '" data-history-date="' + key + '">' +
    '<span class="h-date"><strong>' + formatLongDate(key) + '</strong>' + (relative ? ' <span class="h-relative">' + relative + '</span>' : '') +
    '<span class="h-open">Open ›</span></span>' +
    historyLine('💊', 'Supplements', supplementsSummary(key)) +
    historyLine('😴', 'Sleep', sleepSummary(key)) +
    historyLine('🌡️', 'Symptoms', symptomsSummary(key)) +
    historyLine('🏃', 'Exercise', exerciseSummary(key)) +
    historyLine('⚡', 'Migraine', migraineSummary(key)) +
    (prn ? historyLine('💊', 'As needed', prn) : '') +
    '</button>';
}

// A thin row for a stretch of days with nothing recorded (tap = open the newest of them)
function gapRow(newest, oldest) {
  const days = Math.round((keyToDate(newest) - keyToDate(oldest)) / 86400000) + 1;
  const range = newest === oldest ? formatDayMonth(newest) : formatDayMonth(oldest) + ' – ' + formatDayMonth(newest);
  return '<button type="button" class="history-gap" data-history-date="' + newest + '">' +
    'Nothing recorded · ' + range + ' (' + count(days, 'day', 'days') + ')</button>';
}

function renderHistory() {
  const today = todayKey();
  const dates = Object.keys(data.days)
    .filter(function (key) { return key >= EARLIEST_DATE && key <= today; })
    .sort()
    .reverse();

  document.getElementById('history-subtitle').textContent = dates.length
    ? count(dates.length, 'day', 'days') + ' with records since ' + formatShortDate(EARLIEST_DATE) + ' · tap a day to view or edit it'
    : '';

  if (dates.length === 0) {
    document.getElementById('history-list').innerHTML =
      '<div class="card empty-state"><p class="empty-icon">🗂️</p><p>Nothing recorded yet.</p>' +
      '<p class="help-text">Days you fill in on the Daily Log will appear here.</p></div>';
    return;
  }

  let html = '';
  let expected = today;   // the next date we'd expect, walking backwards
  dates.forEach(function (key) {
    if (key < expected) html += gapRow(expected, addDays(key, 1));
    html += historyCard(key);
    expected = addDays(key, -1);
  });
  if (expected >= EARLIEST_DATE) html += gapRow(expected, EARLIEST_DATE);

  document.getElementById('history-list').innerHTML = html;
}


// ------------------------------------------------------------
// DASHBOARD (Step 10)
// Read-only counts for a week (Sun–Sat) or a month, computed from the
// same daily records. Nothing is stored. "–" means nothing recorded,
// which is different from 0.
// ------------------------------------------------------------

let dashMode = 'week';          // 'week' or 'month'
let dashAnchor = todayKey();    // any date inside the period being shown

// --- Periods ---

// The full week (Sunday–Saturday) or calendar month containing a date
function periodFor(mode, key) {
  if (mode === 'week') {
    const start = addDays(key, -keyToDate(key).getDay());
    return { start: start, end: addDays(start, 6) };
  }
  const date = keyToDate(key);
  return {
    start: dateKey(new Date(date.getFullYear(), date.getMonth(), 1)),
    end: dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
  };
}

// The part of a period we can count: from Oct 1, 2026 up to today
function countedRange(period) {
  const today = todayKey();
  return {
    start: period.start < EARLIEST_DATE ? EARLIEST_DATE : period.start,
    end: period.end > today ? today : period.end,
  };
}

function shiftPeriod(mode, key, steps) {
  if (mode === 'week') return addDays(periodFor('week', key).start, steps * 7);
  const date = keyToDate(key);
  return dateKey(new Date(date.getFullYear(), date.getMonth() + steps, 1));
}

function daysBetween(start, end) {
  const days = [];
  for (let key = start; key <= end; key = addDays(key, 1)) days.push(key);
  return days;
}

// e.g. "Nov 8 – 14", "Oct 25 – Nov 1", "November 2026"
function periodLabel(mode, period, short) {
  if (mode === 'month') {
    return keyToDate(period.start).toLocaleDateString('en-US', short ? { month: 'short' } : { month: 'long', year: 'numeric' });
  }
  const start = keyToDate(period.start);
  const end = keyToDate(period.end);
  return start.getMonth() === end.getMonth()
    ? formatDayMonth(period.start) + ' – ' + end.getDate()
    : formatDayMonth(period.start) + ' – ' + formatDayMonth(period.end);
}

// e.g. "This week · so far (3 of 7 days)" or "Partial: from Oct 1 (3 of 7 days)"
function periodNote(mode, period) {
  const range = countedRange(period);
  const total = daysBetween(period.start, period.end).length;
  const counted = daysBetween(range.start, range.end).length;
  const isCurrent = period.start <= todayKey() && todayKey() <= period.end;
  const notes = [];
  if (isCurrent) notes.push(mode === 'week' ? 'This week' : 'This month');
  if (range.start > period.start) notes.push('partial: from ' + formatDayMonth(range.start));
  if (range.end < period.end) notes.push('so far');
  return notes.join(' · ') + (counted < total ? ' (' + counted + ' of ' + total + ' days)' : (notes.length ? '' : count(total, 'day', 'days')));
}

// --- Calculations ---

const HARD_NIGHT_ANSWERS = ['30-60', '>60', 'unable'];

function periodStats(range) {
  const s = {
    days: 0,
    dosesTaken: 0, dosesMissed: 0, dosesOpen: 0,
    planned: 0, plannedDone: 0, plannedNotDone: 0, plannedOpen: 0, extras: 0, extraMinutes: 0,
    migraineDays: 0, migraineFreeDays: 0, migraineEpisodes: 0,
    hardNights: 0, fineNights: 0,
    prnIntakes: 0, prnForMigraine: 0,
    helped: { helped: 0, partial: 0, no: 0, unknown: 0 },
  };

  daysBetween(range.start, range.end).forEach(function (key) {
    s.days++;

    // scheduled supplements & medications
    dosesForDate(key).forEach(function (d) {
      if (d.status === 'taken') s.dosesTaken++;
      else if (d.status === 'missed') s.dosesMissed++;
      else s.dosesOpen++;
    });

    // planned workouts (schedule that applied on that day) + unplanned
    sessionsForDate(key).forEach(function (w) {
      s.planned++;
      if (w.status === 'completed') s.plannedDone++;
      else if (w.status === 'not_completed') s.plannedNotDone++;
      else s.plannedOpen++;
    });
    extrasFor(key).forEach(function (e) { s.extras++; s.extraMinutes += e.minutes || 0; });

    // migraines: distinct days, not episodes
    const episodes = migrainesFor(key);
    if (episodes.length) { s.migraineDays++; s.migraineEpisodes += episodes.length; }
    else if (noMigraineOn(key)) s.migraineFreeDays++;

    // sleep: a "hard night" needs an answer about falling back asleep
    const sleep = sleepFor(key);
    if (HARD_NIGHT_ANSWERS.includes(sleep.fallBackAsleep)) s.hardNights++;
    else if (sleep.awakenings === 'none' || sleep.fallBackAsleep) s.fineNights++;

    // as-needed medication intakes and how the linked episode's treatment went
    intakesFor(key).forEach(function (intake) {
      s.prnIntakes++;
      const episode = episodeForIntake(key, intake.id);
      if (!episode) return;
      s.prnForMigraine++;
      s.helped[episode.helped || 'unknown']++;
    });
  });

  s.migraineNoData = s.days - s.migraineDays - s.migraineFreeDays;
  s.sleepNoData = s.days - s.hardNights - s.fineNights;
  s.adherence = s.dosesTaken + s.dosesMissed ? Math.round(s.dosesTaken / (s.dosesTaken + s.dosesMissed) * 100) : null;
  s.workoutRate = s.planned ? Math.round(s.plannedDone / s.planned * 100) : null;
  return s;
}

// --- Showing it ---

function miniBar(percent) {
  return '<div class="mini-bar" aria-hidden="true"><span style="width:' + (percent || 0) + '%"></span></div>';
}

function statCard(label, value, sub, percent) {
  return '<div class="stat">' +
    '<p class="stat-label">' + label + '</p>' +
    '<p class="stat-value">' + value + '</p>' +
    (percent !== undefined && percent !== null ? miniBar(percent) : '') +
    '<p class="stat-sub">' + sub + '</p></div>';
}

function dash(text) { return '<span class="h-none">' + text + '</span>'; }

function renderOverview(s) {
  const migraine = s.migraineDays || s.migraineFreeDays
    ? statCard('⚡ Migraine days', s.migraineDays + ' <span class="stat-of">of ' + s.days + '</span>',
      s.migraineFreeDays + ' migraine-free · ' + s.migraineNoData + ' no data')
    : statCard('⚡ Migraine days', dash('–'), dash('Nothing recorded'));

  const workouts = s.planned
    ? statCard('🏃 Planned workouts', s.workoutRate + '%',
      s.plannedDone + ' of ' + s.planned + ' done' +
      (s.plannedOpen ? ' · <span class="h-none">' + s.plannedOpen + ' not recorded</span>' : '') +
      (s.extras ? '<br>+ ' + count(s.extras, 'unplanned', 'unplanned') + ' (' + s.extraMinutes + ' min)' : ''),
      s.workoutRate)
    : statCard('🏃 Planned workouts', dash('N/A'),
      'No planned workouts' + (s.extras ? '<br>+ ' + count(s.extras, 'unplanned', 'unplanned') : ''));

  const sleep = s.hardNights || s.fineNights
    ? statCard('😴 Hard nights', s.hardNights + ' <span class="stat-of">of ' + (s.hardNights + s.fineNights) + '</span>',
      'Back to sleep took 30+ min or not at all · ' + s.sleepNoData + ' no data')
    : statCard('😴 Hard nights', dash('–'), dash('Nothing recorded'));

  const doses = s.dosesTaken + s.dosesMissed + s.dosesOpen;
  const supplements = s.adherence !== null
    ? statCard('💊 Supplements & meds', s.adherence + '%',
      s.dosesTaken + ' taken · ' + s.dosesMissed + ' missed' +
      (s.dosesOpen ? ' · <span class="h-none">' + s.dosesOpen + ' not recorded</span>' : ''), s.adherence)
    : statCard('💊 Supplements & meds', dash('–'), dash(doses ? count(doses, 'dose', 'doses') + ' not recorded' : 'Nothing scheduled'));

  document.getElementById('dash-overview').innerHTML = migraine + workouts + sleep + supplements;
}

function renderPrnSummary(s) {
  let html = '<p class="prn-line"><strong>💊 As-needed medications:</strong> ';
  if (!s.prnIntakes) {
    html += '<span class="h-none">none logged</span></p>';
  } else {
    html += count(s.prnIntakes, 'intake', 'intakes') +
      (s.prnForMigraine ? ' · ' + s.prnForMigraine + ' for migraine' : '') + '</p>';
    if (s.prnForMigraine) {
      html += '<p class="prn-effect">Helped ' + s.helped.helped + ' · Partially ' + s.helped.partial +
        ' · Did not help ' + s.helped.no + ' · <span class="h-none">Not recorded ' + s.helped.unknown + '</span></p>';
    }
  }
  document.getElementById('dash-prn').innerHTML = html;
}

function renderTrend(selected) {
  // the selected period and up to 5 before it (none before Oct 1, 2026)
  const periods = [];
  let key = selected.start;
  for (let i = 0; i < 6; i++) {
    const period = periodFor(dashMode, key);
    if (period.end < EARLIEST_DATE) break;
    periods.push(period);
    key = shiftPeriod(dashMode, key, -1);
  }

  let html = '<thead><tr><th>' + (dashMode === 'week' ? 'Week' : 'Month') + '</th>' +
    '<th>⚡ Migraine days</th><th>🏃 Workouts</th><th>😴 Hard nights</th></tr></thead><tbody>';
  periods.forEach(function (period) {
    const range = countedRange(period);
    const s = periodStats(range);
    const partial = range.start > period.start || range.end < period.end;
    const workoutCell = s.planned
      ? '<span class="t-pct">' + s.workoutRate + '%</span>' + miniBar(s.workoutRate) +
        (s.plannedOpen ? '<span class="t-note">' + s.plannedOpen + ' not rec.</span>' : '')
      : '<span class="h-none">N/A</span>';
    html += '<tr data-dash-period="' + period.start + '"' + (period.start === selected.start ? ' class="selected"' : '') + '>' +
      '<td>' + periodLabel(dashMode, period, true) + (partial ? '<span class="t-note">partial</span>' : '') + '</td>' +
      '<td class="t-num">' + (s.migraineDays || s.migraineFreeDays ? s.migraineDays : '<span class="h-none">–</span>') + '</td>' +
      '<td>' + workoutCell + '</td>' +
      '<td class="t-num">' + (s.hardNights || s.fineNights ? s.hardNights : '<span class="h-none">–</span>') + '</td></tr>';
  });
  document.getElementById('dash-trend').innerHTML = html + '</tbody>';
  document.getElementById('dash-trend-title').textContent = dashMode === 'week' ? 'Recent weeks' : 'Recent months';
}

function renderDashboard() {
  // keep the chosen date inside Oct 1, 2026 – today (e.g. after switching
  // from the first week, which starts on Sunday Sep 27, to Month)
  if (dashAnchor < EARLIEST_DATE) dashAnchor = EARLIEST_DATE;
  if (dashAnchor > todayKey()) dashAnchor = todayKey();
  const period = periodFor(dashMode, dashAnchor);
  const range = countedRange(period);
  const stats = periodStats(range);

  document.querySelectorAll('[data-dash-mode]').forEach(function (button) {
    button.setAttribute('aria-pressed', String(button.dataset.dashMode === dashMode));
  });
  document.getElementById('dash-label').textContent = periodLabel(dashMode, period, false);
  document.getElementById('dash-sub').textContent = periodNote(dashMode, period);
  document.getElementById('dash-prev').disabled = period.start <= EARLIEST_DATE;
  document.getElementById('dash-next').disabled = period.end >= todayKey();

  renderOverview(stats);
  renderPrnSummary(stats);
  renderTrend(period);
}


// ------------------------------------------------------------
// NAVIGATION (Step 1)
// ------------------------------------------------------------

// The title shown in the top bar for each screen
const SCREEN_TITLES = {
  today: 'Daily Log',
  history: 'History',
  dashboard: 'Dashboard',
  setup: 'Setup',
};

// Remembers which main tab you were on, so "Back" from Setup returns there
let lastTab = 'today';

// Show one screen and hide all the others
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(function (screen) {
    screen.hidden = screen.id !== 'screen-' + name;
  });

  document.getElementById('screen-title').textContent = SCREEN_TITLES[name];

  // Highlight the matching tab (none is highlighted while in Setup)
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.classList.toggle('active', tab.dataset.screen === name);
  });

  // In Setup, swap the ⚙️ button for a Back button
  const inSetup = name === 'setup';
  document.getElementById('setup-button').hidden = inSetup;
  document.getElementById('back-button').hidden = !inSetup;

  if (inSetup) {
    document.getElementById('backup-message').hidden = true;
    renderSetup();
  } else {
    lastTab = name;
  }
  if (name === 'today') renderToday();
  if (name === 'history') renderHistory();
  if (name === 'dashboard') renderDashboard();
  window.scrollTo(0, 0);
}



// ------------------------------------------------------------
// CONNECT BUTTONS TO ACTIONS
// ------------------------------------------------------------

document.querySelectorAll('.tab').forEach(function (tab) {
  tab.addEventListener('click', function () {
    showScreen(tab.dataset.screen);
  });
});
document.getElementById('setup-button').addEventListener('click', function () {
  showScreen('setup');
});
document.getElementById('back-button').addEventListener('click', function () {
  showScreen(lastTab);
});

document.getElementById('export-button').addEventListener('click', downloadBackup);
document.getElementById('share-button').addEventListener('click', shareBackup);
document.getElementById('import-button').addEventListener('click', function () {
  document.getElementById('import-file').click();  // opens the file picker
});
document.getElementById('import-file').addEventListener('change', function (event) {
  const file = event.target.files[0];
  if (file) restoreFromFile(file);
  event.target.value = '';  // so the same file can be picked again later
});
document.getElementById('undo-restore-button').addEventListener('click', undoRestore);

// Setup: supplements & medications
document.getElementById('add-supplement-button').addEventListener('click', function () {
  openSupplementForm(null);
});
document.getElementById('supplement-list').addEventListener('click', function (event) {
  const row = event.target.closest('[data-id]');
  if (row) openSupplementForm(row.dataset.id);
});
supplementForm.addEventListener('submit', saveSupplementForm);
document.getElementById('add-time-button').addEventListener('click', function () {
  addTimeRow('');
});
document.getElementById('time-list').addEventListener('click', function (event) {
  if (!event.target.classList.contains('remove-time')) return;
  event.target.closest('.time-row').remove();
  updateRemoveTimeButtons();
  updateSupplementApplyFrom();
});
// Show or hide "Apply this change from" as you edit
supplementForm.addEventListener('input', updateSupplementApplyFrom);
supplementForm.addEventListener('change', updateSupplementApplyFrom);
workoutForm.addEventListener('change', updateWorkoutApplyFrom);
document.getElementById('frequency-choices').addEventListener('change', updateDayPicker);
document.getElementById('schedule-choices').addEventListener('change', updateScheduleFields);
document.getElementById('archive-supplement-button').addEventListener('click', archiveSupplementFromForm);

// Setup: weekly workout schedule
document.getElementById('add-workout-button').addEventListener('click', function () {
  openWorkoutForm(null);
});
document.getElementById('workout-list').addEventListener('click', function (event) {
  const row = event.target.closest('[data-id]');
  if (row) openWorkoutForm(row.dataset.id);
});
workoutForm.addEventListener('submit', saveWorkoutForm);
document.getElementById('archive-workout-button').addEventListener('click', archiveWorkoutFromForm);

// "Restore" buttons in the Archived lists
function listenForRestore(listId, getItems) {
  document.getElementById(listId).addEventListener('click', function (event) {
    const button = event.target.closest('[data-restore]');
    if (!button) return;
    const item = getItems().find(function (i) { return i.id === button.dataset.restore; });
    if (!item) return;
    restoreItem(item);
    saveData();
    renderSetup();
  });
}
listenForRestore('supplement-archive-list', function () { return data.settings.supplements; });
listenForRestore('workout-archive-list', function () { return data.settings.workoutPlan; });

// Today: supplements & medications checklist
document.getElementById('today-supplements').addEventListener('click', function (event) {
  const statusButton = event.target.closest('[data-status]');
  if (statusButton) {
    const value = statusButton.dataset.status;
    const id = statusButton.closest('[data-dose]').dataset.dose;
    setDoseStatus(selectedDate, id, value === 'none' ? null : value);
    return;
  }
  const allTaken = event.target.closest('[data-all-taken]');
  if (allTaken) {
    markGroupTaken(selectedDate, allTaken.dataset.allTaken);
    return;
  }
  if (event.target.closest('[data-open-setup]')) showScreen('setup');
});
document.getElementById('today-supplements').addEventListener('change', function (event) {
  if (!event.target.matches('[data-taken-time]')) return;
  setTakenTime(selectedDate, event.target.closest('[data-dose]').dataset.dose, event.target.value);
});

// Daily Log: sleep & symptoms
// Notes save shortly after you stop typing (without redrawing the card,
// so the keyboard stays open). Any waiting note is saved first whenever
// something else happens, so it can never be lost.
let pendingNote = null;
let notesTimer = null;
function saveNoteNow() {
  clearTimeout(notesTimer);
  if (!pendingNote) return;
  setSleepValue(pendingNote.key, 'notes', pendingNote.text.trim() ? pendingNote.text : null);
  pendingNote = null;
}

const sleepCard = document.getElementById('today-sleep');
sleepCard.addEventListener('click', function (event) {
  saveNoteNow();
  const choice = event.target.closest('[data-sleep]');
  if (choice) {
    const field = choice.dataset.sleep;
    const value = choice.dataset.value;
    // tapping the chosen answer again clears it
    setSleepValue(selectedDate, field, sleepFor(selectedDate)[field] === value ? null : value);
    renderSleepCard();
    return;
  }
  const clear = event.target.closest('[data-sleep-clear]');
  if (clear) {
    setSleepValue(selectedDate, clear.dataset.sleepClear, null);
    renderSleepCard();
  }
});
sleepCard.addEventListener('change', function (event) {
  if (event.target.matches('[data-sleep-notes]')) { saveNoteNow(); return; }   // leaving the notes box
  if (event.target.matches('[data-sleep-time]')) {
    saveNoteNow();
    setSleepValue(selectedDate, 'wakeTime', event.target.value || null);
    renderSleepCard();
  }
});
sleepCard.addEventListener('input', function (event) {
  if (!event.target.matches('[data-sleep-notes]')) return;
  pendingNote = { key: selectedDate, text: event.target.value };
  clearTimeout(notesTimer);
  notesTimer = setTimeout(saveNoteNow, 400);
});
// also save a waiting note when you switch apps or close the page
document.addEventListener('visibilitychange', function () {
  if (document.hidden) saveNoteNow();
});

// Daily Log: exercise
const exerciseCard = document.getElementById('today-exercise');
exerciseCard.addEventListener('click', function (event) {
  const statusButton = event.target.closest('[data-session-status]');
  if (statusButton) {
    const value = statusButton.dataset.sessionStatus;
    setSessionStatus(selectedDate, statusButton.closest('[data-plan]').dataset.plan, value === 'none' ? null : value);
    return;
  }
  const quick = event.target.closest('[data-session-quick]');
  if (quick) {
    setSessionDetail(selectedDate, quick.closest('[data-plan]').dataset.plan, 'minutes', Number(quick.dataset.sessionQuick));
    renderExerciseCard();
    return;
  }
  const extra = event.target.closest('[data-extra]');
  if (extra) { openExtraForm(extra.dataset.extra); return; }
  if (event.target.closest('[data-add-extra]')) { openExtraForm(null); return; }
  if (event.target.closest('[data-open-setup]')) showScreen('setup');
});
// minutes and notes are saved as you type (no redraw, so the keyboard stays open)
exerciseCard.addEventListener('input', function (event) {
  const row = event.target.closest('[data-plan]');
  if (!row) return;
  if (event.target.matches('[data-session-minutes]')) {
    const minutes = readMinutes(event.target.value);
    setSessionDetail(selectedDate, row.dataset.plan, 'minutes', minutes);
    row.querySelectorAll('[data-session-quick]').forEach(function (chip) {
      chip.setAttribute('aria-pressed', String(Number(chip.dataset.sessionQuick) === minutes));
    });
  } else if (event.target.matches('[data-session-notes]')) {
    setSessionDetail(selectedDate, row.dataset.plan, 'notes', event.target.value);
  }
});

// Unplanned workout form
extraForm.addEventListener('submit', saveExtraForm);
extraForm.addEventListener('click', function (event) {
  const quick = event.target.closest('[data-extra-quick]');
  if (!quick) return;
  extraForm.elements.minutes.value = quick.dataset.extraQuick;
  updateExtraMinuteChips();
});
extraForm.elements.minutes.addEventListener('input', updateExtraMinuteChips);
document.getElementById('remove-extra-button').addEventListener('click', removeExtraFromForm);

// Daily Log: migraine
document.getElementById('today-migraine').addEventListener('click', function (event) {
  if (event.target.closest('[data-no-migraine]')) { toggleNoMigraine(selectedDate); return; }
  if (event.target.closest('[data-add-migraine]')) { openMigraineForm(null); return; }
  const row = event.target.closest('[data-migraine]');
  if (row) openMigraineForm(row.dataset.migraine);
});
migraineForm.addEventListener('submit', saveMigraineForm);
document.getElementById('link-choices').addEventListener('change', updateHelpedField);
document.getElementById('remove-migraine-button').addEventListener('click', removeMigraineFromForm);

// Daily Log: as-needed medication intake
document.getElementById('today-prn').addEventListener('click', function (event) {
  if (event.target.closest('[data-add-intake]')) { openIntakeForm(null); return; }
  const row = event.target.closest('[data-intake]');
  if (row) openIntakeForm(row.dataset.intake);
});
intakeForm.addEventListener('submit', saveIntakeForm);
document.getElementById('intake-med-choices').addEventListener('change', function () {
  showOtherName();
  fillUsualDose();
});
document.getElementById('remove-intake-button').addEventListener('click', removeIntakeFromForm);

// History: tapping a day (or a stretch of empty days) opens it in the Daily Log
document.getElementById('history-list').addEventListener('click', function (event) {
  const day = event.target.closest('[data-history-date]');
  if (!day) return;
  goToDate(day.dataset.historyDate);
  showScreen('today');
});

// Dashboard: week/month, previous/next period, tap a row in the table
document.querySelectorAll('[data-dash-mode]').forEach(function (button) {
  button.addEventListener('click', function () {
    dashMode = button.dataset.dashMode;
    renderDashboard();
  });
});
document.getElementById('dash-prev').addEventListener('click', function () {
  dashAnchor = shiftPeriod(dashMode, dashAnchor, -1);
  renderDashboard();
});
document.getElementById('dash-next').addEventListener('click', function () {
  const next = shiftPeriod(dashMode, dashAnchor, 1);
  if (next <= todayKey()) dashAnchor = next;   // never a future period
  renderDashboard();
});
document.getElementById('dash-trend').addEventListener('click', function (event) {
  const row = event.target.closest('[data-dash-period]');
  if (!row) return;
  dashAnchor = row.dataset.dashPeriod;
  renderDashboard();
});

// Daily Log: date navigation
document.getElementById('prev-day').addEventListener('click', function () {
  goToDate(addDays(selectedDate, -1));
});
document.getElementById('next-day').addEventListener('click', function () {
  goToDate(addDays(selectedDate, 1));
});
document.getElementById('today-button').addEventListener('click', function () {
  goToDate(todayKey());
});
document.getElementById('switch-today-button').addEventListener('click', function () {
  goToDate(todayKey());
});
const datePicker = document.getElementById('date-picker');
datePicker.addEventListener('click', function () {
  // open the calendar straight away where the browser supports it
  try { datePicker.showPicker(); } catch (error) {}
});
datePicker.addEventListener('change', function () {
  goToDate(datePicker.value);
});

// Check for a new calendar day when you come back to the app, and every minute
document.addEventListener('visibilitychange', function () {
  if (!document.hidden) checkForNewDay();
});
setInterval(checkForNewDay, 60000);

// "Cancel" buttons close their form without saving
document.querySelectorAll('[data-close]').forEach(function (button) {
  button.addEventListener('click', function () {
    button.closest('dialog').close();
  });
});


// ------------------------------------------------------------
// START THE APP
// ------------------------------------------------------------

if (!data.meta.updatedAt) saveData();  // first visit: create the notebook
showScreen('today');
