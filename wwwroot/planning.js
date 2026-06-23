// ── Constants ─────────────────────────────────────────────────
const DAYS_IT    = ['Lunedì','Martedì','Mercoledì','Giovedì','Venerdì'];
const DAYS_SHORT = ['Lun','Mar','Mer','Gio','Ven'];
const MONTHS_IT  = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                    'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const MONTHS_IT_FULL = MONTHS_IT;

function contrastColor(hexColor) {
  const c = hexColor.replace('#','');
  const r = parseInt(c.substring(0,2),16);
  const g = parseInt(c.substring(2,4),16);
  const b = parseInt(c.substring(4,6),16);
  // relative luminance
  const lum = 0.299*r + 0.587*g + 0.114*b;
  return lum > 150 ? '#1a1a2e' : '#ffffff';
}

const COLORS = [
  '#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c',
  '#3498db','#9b59b6','#e91e63','#00bcd4','#8bc34a'
];

const ROLES = { Admin: 1, Therapist: 2 };

const THERAPY_TYPE_LABELS   = { 0: 'Legge 11', 1: 'HKT Individuale', 2: 'HKT Gruppo' };
const THERAPY_STATUS_LABELS = { 0: 'Da iniziare', 1: 'In corso', 2: 'Completata', 3: 'Rifiutata' };
const THERAPY_STATUS_CLASS  = {
  0: 'status-tobestarted', 1: 'status-started',
  2: 'status-completed',   3: 'status-refused'
};

const DAY_NAMES_FULL = ['Lunedì','Martedì','Mercoledì','Giovedì','Venerdì'];
const HOURS = Array.from({length: 9}, (_, i) => i + 8);
const PLAN_COLORS = COLORS;

// ── State ─────────────────────────────────────────────────────
let currentUser    = null;
let currentSection = null;
let currentView    = 'monthly';
let cursor         = new Date();
cursor.setHours(0,0,0,0);
const today = new Date(); today.setHours(0,0,0,0);

let patientPage    = 1;
let patientSortBy  = 'data';
let patientSortDir = 'desc';
let patientSearch  = '';
let patientSearchTimer = null;
let patientCache   = {};

let currentPatientId       = null;
let showArchivedTherapies  = false;
let patientEditMode        = false;
let allTherapies           = [];
let paymentTypes           = [];
let currentTherapyId       = null;
let therapyDurationUserModified = false;
let planReturnPatientId    = null;
let allTherapists          = [];
let calTherapistId         = null;
let calGroups              = [];

let planTherapy       = null;
let planPatient       = null;
let planStructureId   = 1;
let planFrequency     = 1;
let planWeekCursor    = null;
let planSelectedSlots = [];
let planSlotsData     = null;
let planPreviewData   = null;
const planSlotRegistry = {};

let currentGroupId       = null;
let groupTherapistAvail  = [];
let selectedGroupSlot    = null;

// ── Helpers ───────────────────────────────────────────────────
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}
function isWeekend(d) { return d.getDay() === 0 || d.getDay() === 6; }
function dateToYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function getMondayOfWeek(d) {
  const date = new Date(d);
  const dow  = date.getDay() === 0 ? 7 : date.getDay();
  date.setDate(date.getDate() - (dow - 1));
  date.setHours(0,0,0,0);
  return date;
}
function formatPhoneLink(raw) {
  const digits = raw ? raw.replace(/\D/g, '') : '';
  if (!digits) return '';
  const intl = digits.startsWith('39') ? digits : '39' + digits;
  const display = formatPhone(raw);
  return `<span style="white-space:nowrap">
    ${display}
    <a href="tel:+${intl}" class="phone-link" title="Chiama">📞</a>
    <a href="https://wa.me/${intl}" target="_blank" class="phone-link" title="WhatsApp"><img src="imgs/whatsapp.png" style="width:16px;height:16px;vertical-align:middle"></a>
  </span>`;
}

function structureName(id) {
  if (!id) return 'Indifferente';
  return id === 1 ? 'Ponti Rossi' : id === 2 ? 'Porcellane' : '–';
}
function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (!digits.length) return '';
  const parts = [digits.slice(0, 3)];
  let i = 3;
  while (i < digits.length) {
    const remaining = digits.length - i;
    if (remaining === 1) { parts[parts.length-1] += digits[i]; i++; }
    else { parts.push(digits.slice(i, i+2)); i += 2; }
  }
  return parts.join(' ');
}
function capitalizeName(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

// ── API helpers ───────────────────────────────────────────────
function apiGet(url) { return $.getJSON(url); }
function apiPost(url, data) {
  return $.ajax({ url, method: 'POST', contentType: 'application/json', data: JSON.stringify(data) });
}
function apiPut(url, data) {
  return $.ajax({ url, method: 'PUT', contentType: 'application/json', data: JSON.stringify(data) });
}
function apiDelete(url) { return $.ajax({ url, method: 'DELETE' }); }

// ── 401 interceptor ───────────────────────────────────────────
$(document).ajaxError((event, jqXHR, settings) => {
  if (jqXHR.status === 401) {
    if (!settings.url.includes('api/me') && !settings.url.includes('api/login')) {
      currentUser = null;
      showLogin();
    }
  }
});

// ── Boot ──────────────────────────────────────────────────────
$(document).ready(async () => {
  try {
    const user = await apiGet('api/me');
    currentUser = user;
    showApp();
  } catch {
    showLogin();
  }
});

// ── Login ─────────────────────────────────────────────────────
function showLogin() {
  $('#page-login').removeClass('hidden');
  $('#page-app').addClass('hidden');
  $('#login-username').focus();
}

function showApp() {
  $('#page-login').addClass('hidden');
  $('#page-app').removeClass('hidden');
  $('#topbar-username').text(currentUser.fullName);

  const roles = parseInt(currentUser.roles);
  const isAdmin = !!(roles & ROLES.Admin);
  const isTherapistOnly = !!(roles & ROLES.Therapist) && !isAdmin;

  if (isAdmin) {
    $('#nav-admin-group').removeClass('hidden');
  }
  if (isTherapistOnly) {
    $('#nav-calendar-group, #nav-patients-group, #nav-admin-group').addClass('hidden');
    $('#nav-therapist-group').removeClass('hidden');
    calTherapistId = currentUser.id;
  }

  loadStructuresAndInit();

  if (isTherapistOnly) navTo('cal-daily');
  else navTo('cal-monthly');
}

// ── Sidebar ───────────────────────────────────────────────────
$(document).on('click', '#hamburger-btn', () => {
  $('#sidebar').toggleClass('open');
  $('#sidebar-overlay').toggleClass('open');
});

$(document).on('click', '#sidebar-overlay', () => {
  $('#sidebar').removeClass('open');
  $('#sidebar-overlay').removeClass('open');
});

$(document).on('click', '.nav-item', function() {
  const section = $(this).data('section');
  if (!section) return;

  // user form guard
  if (!$('#user-form-container').hasClass('hidden')) {
    if (isUserFormDirty()) {
      if (!confirm("Vuoi abbandonare le modifiche all'utente?")) return;
    }
    userFormOriginal = null;
    $('#user-form-container').addClass('hidden');
  }

  // planning confirmation
  if ($('#section-planning').is(':visible')) {
    if (!confirm("Sei sicuro di voler abbandonare la pianificazione? I dati non salvati andranno persi.")) return;
    pianificaAbbandona();
    return;
  }

  $('#sidebar').removeClass('open');
  $('#sidebar-overlay').removeClass('open');
  navTo(section);
});

// ── Navigation ────────────────────────────────────────────────
const CAL_VIEWS = {
  'cal-daily': 'daily', 'cal-weekly': 'weekly', 'cal-monthly': 'monthly',
  'cal-uso-giornaliero': 'uso-daily', 'cal-uso-settimanale': 'uso-weekly'
};

function navTo(section, push = true) {
  if (CAL_VIEWS[section]) currentView = CAL_VIEWS[section];

  $('.nav-item').removeClass('active');
  $(`.nav-item[data-section="${section}"]`).addClass('active');

  const domSection = section === 'cal-disponibilita' ? 'cal-disponibilita' : (section.startsWith('cal') ? 'calendario' : section);
  $('.section').addClass('hidden');
  $(`#section-${domSection}`).removeClass('hidden');

  currentSection = section;
  if (push) history.pushState({ section, view: currentView, date: cursor.toISOString() }, '');

  if (section.startsWith('cal') && section !== 'cal-disponibilita') {
    const roles = parseInt(currentUser?.roles || 0);
    const isTherapistOnly = !!(roles & ROLES.Therapist) && !(roles & ROLES.Admin);
    if (isTherapistOnly) loadTherapistCalendar();
    else {
      populateTherapistSelect('#cal-therapist-select');
      if (currentView === 'monthly') {
        $('#cal-no-therapist').hide();
        $('#cal-nav-controls').show();
        $('.calendar-card').show();
      }
      loadCalendarPeriod();
    }
  }
  if (section === 'admin-users')      loadUsers();
  if (section === 'pazienti-elenco')  loadPatients();
  if (section === 'pazienti-attesa')  loadWaitingList();
  if (section === 'admin-convenzioni') loadConvenzioni();
  if (section === 'admin-gruppi')     loadGroups();
  if (section === 'admin-ferie')       loadVacations();
  if (section === 'cal-disponibilita') loadDisponibilita();
  if (section === 'pazienti-avvisi')   loadAvvisi();
}

window.addEventListener('popstate', e => {
  if (!currentUser) return;
  const state = e.state;
  if (!state) return;
  if (state.section) {
    if (state.view) currentView = state.view;
    if (state.date) cursor = new Date(state.date);
    navTo(state.section, false);
  }
});

// ── User menu ─────────────────────────────────────────────────
$(document).on('click', '#user-menu-btn', e => {
  e.stopPropagation();
  $('#user-menu').toggleClass('hidden');
});
$(document).on('click', e => {
  if (!$(e.target).closest('#user-menu-wrap').length) $('#user-menu').addClass('hidden');
});
$(document).on('click', '#btn-change-pwd', () => { $('#user-menu').addClass('hidden'); openChangePassword(); });
$(document).on('click', '#btn-logout', doLogout);
$(document).on('click', '#btn-cancel-pwd', closeModal);
$(document).on('click', '#modal-overlay', function(e) { if ($(e.target).is('#modal-overlay')) closeModal(); });
$(document).on('click', '#btn-save-pwd', doChangePassword);

function openChangePassword() {
  $('#pwd-current, #pwd-new, #pwd-confirm').val('');
  $('#pwd-error, #pwd-success').addClass('hidden');
  $('#modal-overlay').removeClass('hidden');
}
function closeModal() { $('#modal-overlay').addClass('hidden'); }

async function doLogin() {
  const loginName = $('#login-username').val().trim();
  const password  = $('#login-password').val();
  $('#login-error').addClass('hidden');
  try {
    const data = await apiPost('api/login', { loginName, password });
    currentUser = data;
    showApp();
  } catch (xhr) {
    const err = xhr.responseJSON?.error || 'Errore di accesso';
    $('#login-error').text(err).removeClass('hidden');
  }
}

async function doLogout() {
  await apiPost('api/logout', {});
  currentUser = null;
  showLogin();
}

async function doChangePassword() {
  const current = $('#pwd-current').val();
  const newPwd  = $('#pwd-new').val();
  const confirm = $('#pwd-confirm').val();
  $('#pwd-error, #pwd-success').addClass('hidden');
  if (newPwd !== confirm) {
    $('#pwd-error').text('Le password non coincidono').removeClass('hidden');
    return;
  }
  try {
    await apiPost('api/account/password', { currentPassword: current, newPassword: newPwd });
    $('#pwd-success').text('Password aggiornata con successo').removeClass('hidden');
    $('#pwd-current, #pwd-new, #pwd-confirm').val('');
  } catch (xhr) {
    $('#pwd-error').text(xhr.responseJSON?.error || 'Errore').removeClass('hidden');
  }
}

$(document).on('click', '#login-btn', doLogin);
$(document).on('keydown', '#login-password', e => { if (e.key === 'Enter') doLogin(); });

// ── Calendar ──────────────────────────────────────────────────
let calPeriodData  = null;
let calStructureId = 1;

$(document).on('change', '#topbar-structure', async () => {
  calStructureId = parseInt($('#topbar-structure').val());
  calTherapistId = null;
  // reload therapists for new structure
  await loadTherapists();
  populateTherapistSelect('#cal-therapist-select');
  await loadCalendarPeriod();
});

$(document).on('change', '#cal-therapist-select', async () => {
  calTherapistId = $('#cal-therapist-select').val() || null;
  await loadCalendarPeriod();
});
$(document).on('click', '#cal-prev',  () => navigate(-1));
$(document).on('click', '#cal-next',  () => navigate(1));
$(document).on('click', '#cal-today', goToday);

async function loadTherapistCalendar() {
  if (!currentUser) return;
  calTherapistId = currentUser.id;
  await loadCalendarPeriod();
}

async function loadCalendarPeriod() {
  const roles = parseInt(currentUser?.roles || 0);
  const isTherapistOnly = !!(roles & ROLES.Therapist) && !(roles & ROLES.Admin);
  const tid = isTherapistOnly ? currentUser.id : calTherapistId;
  // always fetch - Tutti means all therapists of the structure

  // determine date range based on current view
  let start, end;
  if (currentView === 'daily') {
    start = dateToYMD(cursor);
    end   = dateToYMD(cursor);
  } else if (currentView === 'weekly') {
    const mon = getMondayOfWeek(cursor);
    start = dateToYMD(mon);
    end   = dateToYMD(new Date(mon.getTime() + 4*86400000));
  } else {
    // monthly - get full month range
    const y = cursor.getFullYear(), m = cursor.getMonth();
    start = dateToYMD(new Date(y, m, 1));
    end   = dateToYMD(new Date(y, m+1, 0));
  }

  // use selected structure from topbar
  const structureId = calStructureId || 1;

  try {
    const params = new URLSearchParams({ structureId, startDate: start, endDate: end });
    if (tid) params.set('therapistId', tid);
    calPeriodData = await apiGet('api/calendar/period?' + params.toString());
  } catch { calPeriodData = null; }

  renderCalendar();
}

function renderCalendar() {
  const roles = parseInt(currentUser?.roles || 0);
  const isTherapistOnly = !!(roles & ROLES.Therapist) && !(roles & ROLES.Admin);
  const therapistId = isTherapistOnly ? currentUser.id : calTherapistId;

  $('#cal-no-therapist').addClass('hidden');
  if (!calPeriodData && !isTherapistOnly) {
    $('#cal-no-therapist').removeClass('hidden');
  }
  $('#cal-nav-controls').show();
  $('.calendar-card').show();

  $('#view-monthly, #view-weekly, #view-daily').hide();
  const viewEl = currentView === 'uso-daily' ? 'daily' : currentView === 'uso-weekly' ? 'weekly' : currentView;
  $(`#view-${viewEl}`).show();

  if (currentView === 'monthly')         renderMonthly();
  else if (currentView === 'weekly')     renderWeeklyFull();
  else if (currentView === 'uso-daily')  renderUsoGiornaliero();
  else if (currentView === 'uso-weekly') renderUsoSettimanale();
  else                                   renderDailyFull();
}

async function navigate(dir) {
  if (currentView === 'monthly') cursor = new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
  else if (currentView === 'weekly' || currentView === 'uso-weekly') cursor = new Date(cursor.getTime() + dir * 7 * 86400000);
  else {
    let next = new Date(cursor.getTime() + dir * 86400000);
    while (isWeekend(next)) next = new Date(next.getTime() + dir * 86400000);
    cursor = next;
  }
  await loadCalendarPeriod();
  history.pushState({ section: currentSection, view: currentView, date: cursor.toISOString() }, '');
}

async function goToday() {
  cursor = new Date(today);
  await loadCalendarPeriod();
  history.pushState({ section: currentSection, view: currentView, date: cursor.toISOString() }, '');
}

function goDay(y, m, d, therapistId) {
  history.pushState({ section: currentSection, view: currentView, date: cursor.toISOString() }, '');
  cursor = new Date(y, m, d);
  currentView = 'daily';
  currentSection = 'cal-daily';
  if (therapistId !== undefined) {
    calTherapistId = therapistId || null;
    $('#cal-therapist-select').val(calTherapistId || '');
    populateTherapistSelect('#cal-therapist-select');
    $('#cal-therapist-select').val(calTherapistId || '');
  }
  $('.nav-item').removeClass('active');
  $('[data-section="cal-daily"]').addClass('active');
  loadCalendarPeriod();
  history.pushState({ section: 'cal-daily', view: 'daily', date: cursor.toISOString() }, '');
}

function renderMonthly() {
  const year = cursor.getFullYear(), month = cursor.getMonth();
  $('#period-label').text(MONTHS_IT[month] + ' ' + year);

  let start = new Date(year, month, 1);
  let dow = start.getDay(); if (dow === 0) dow = 7;
  start.setDate(start.getDate() - (dow - 1));
  let end = new Date(year, month + 1, 0);
  let edow = end.getDay(); if (edow === 0) edow = 7;
  end.setDate(end.getDate() + (5 - edow));

  const cells = [];
  let d = new Date(start);
  while (d <= end) { if (!isWeekend(d)) cells.push(new Date(d)); d = new Date(d.getTime() + 86400000); }

  const data       = calPeriodData;
  const singleThId = calTherapistId ? parseInt(calTherapistId) : null;
  const structureId = calStructureId || 1;

  let html = DAYS_IT.map(n => `<div class="month-day-header">${n}</div>`).join('');

  cells.forEach(day => {
    const other   = day.getMonth() !== month ? ' other-month' : '';
    const isToday = isSameDay(day, today) ? ' today' : '';
    const dateStr = dateToYMD(day);
    const dayDow  = day.getDay() === 0 ? 7 : day.getDay();

    let cellContent = '';

    if (data) {
      const isVac = isVacationDay(dateStr);
      if (isVac) {
        cellContent = `<div class="month-vacation">${isVac.name}</div>`;
      } else if (singleThId) {
        // single therapist: Occupazione and Gruppi only
        const thAvails = (data.availabilities || []).filter(a =>
          a.userId === singleThId && a.dayOfWeek === dayDow);
        let B = 0;
        thAvails.forEach(a => { B += a.endHour - a.startHour; });

        const thGroups = (data.groups || []).filter(g =>
          g.therapistId === singleThId && g.dayOfWeek === dayDow);
        B = Math.max(0, B - thGroups.length);

        const A = (data.plannedSlots || []).filter(ps =>
          ps.date === dateStr && ps.therapistId === singleThId && !ps.groupId).length;

        const lines = [];
        if (B > 0 || A > 0) {
          const warn = A < B ? ' <span class="month-warn">❗</span>' : '';
          lines.push(`<div class="month-summary-line">Terapisti: ${A}/${B}${warn}</div>`);
        }
        if (thGroups.length > 0) {
          const S = thGroups.reduce((acc, g) => acc + g.memberCount, 0);
          const M = thGroups.length * 5;
          const warnG = S < M ? ' <span class="month-warn">❗</span>' : '';
          lines.push(`<div class="month-summary-line">Gruppi: ${S}/${M}${warnG}</div>`);
        }
        cellContent = lines.join('');
      } else {
        // tutti therapists
        const avails  = data.availabilities || [];
        const groups  = data.groups || [];
        const slots   = data.plannedSlots || [];
        const therapists = data.therapists || [];

        // Terapisti: A/B where B=available hours minus group hours, A=planned individual slots
        const dayGroups = (data.groups || []).filter(g => g.dayOfWeek === dayDow);
        let B = 0;
        (data.availabilities || []).filter(a => a.dayOfWeek === dayDow).forEach(a => {
          B += a.endHour - a.startHour;
        });
        B = Math.max(0, B - dayGroups.length);
        const A = (data.plannedSlots || []).filter(ps => ps.date === dateStr && !ps.groupId).length;

        // Gruppi: S/M
        const S = dayGroups.reduce((acc, g) => acc + g.memberCount, 0);
        const M = dayGroups.length * 5;

        const lines = [];
        if (B > 0 || A > 0) {
          const warnT = A < B ? ' <span class="month-warn">❗</span>' : '';
          lines.push(`<div class="month-summary-line">Terapisti: ${A}/${B}${warnT}</div>`);
        }
        if (dayGroups.length > 0) {
          const warnG = S < M ? ' <span class="month-warn">❗</span>' : '';
          lines.push(`<div class="month-summary-line">Gruppi: ${S}/${M}${warnG}</div>`);
        }
        cellContent = lines.join('');
      }
    }

    // find first therapist with availability for click
    const firstThId = data ? (() => {
      const a = (data.availabilities||[]).find(av => av.dayOfWeek === dayDow);
      return a ? a.userId : null;
    })() : null;
    const clickThId = singleThId || firstThId || '';

    html += `<div class="month-cell${other}${isToday}" data-y="${day.getFullYear()}" data-m="${day.getMonth()}" data-d="${day.getDate()}" data-th="${clickThId}">
      <div class="day-num">${day.getDate()}</div>
      ${cellContent}
    </div>`;
  });

  $('#view-monthly').html(`<div class="month-grid">${html}</div>`);
}

$(document).on('click', '.month-cell', function() {
  const thId = $(this).data('th');
  if (thId) {
    calTherapistId = String(thId);
    populateTherapistSelect('#cal-therapist-select');
    $('#cal-therapist-select').val(calTherapistId);
  }
  goDay($(this).data('y'), $(this).data('m'), $(this).data('d'), thId || null);
});

// ── Calendar period helpers ───────────────────────────────────
function calHourRange() {
  if (!calPeriodData?.availabilities?.length) return { minHour: 8, maxHour: 17 };
  const hours = calPeriodData.availabilities;
  return {
    minHour: Math.min(...hours.map(a => a.startHour)),
    maxHour: Math.max(...hours.map(a => a.endHour))
  };
}

function isVacationDay(dateStr) {
  if (!calPeriodData?.vacations) return null;
  const d = new Date(dateStr);
  return calPeriodData.vacations.find(v => {
    if (v.isYearIndependent && v.month && v.day)
      return d.getMonth()+1 === v.month && d.getDate() === v.day && v.therapistId === null;
    if (!v.isYearIndependent && v.startDate && v.endDate && v.therapistId === null) {
      const s = new Date(v.startDate), e = new Date(v.endDate);
      return d >= s && d <= e;
    }
    return false;
  });
}

function isHourInAvailability(therapistId, dow, hour) {
  if (!calPeriodData?.availabilities) return false;
  return calPeriodData.availabilities.some(a =>
    a.userId === therapistId && a.dayOfWeek === dow &&
    hour >= a.startHour && hour < a.endHour
  );
}

function getCellItems(dateStr, hour) {
  if (!calPeriodData) return [];
  const d   = new Date(dateStr);
  const dow = d.getDay() === 0 ? 7 : d.getDay();
  const items = [];

  // groups (recurring by dayOfWeek)
  (calPeriodData.groups || []).forEach(g => {
    if (g.dayOfWeek === dow && g.startHour === hour) {
      const color = COLORS[g.therapistColor] || '#3498db';
      items.push({ color, label: `Gruppo (${g.sex}) ${g.therapistName.split(' ')[0]} [${g.memberCount}/5]`, fg: contrastColor(color) });
    }
  });

  // planned slots - skip group slots (groupId != null) as they are represented by the group box
  (calPeriodData.plannedSlots || []).forEach(ps => {
    if (ps.date === dateStr && ps.startHour === hour && !ps.groupId) {
      const color = COLORS[ps.therapistColor] || '#3498db';
      items.push({ color, label: ps.patientName, fg: contrastColor(color) });
    }
  });

  return items;
}

function renderCellItems(items) {
  if (!items.length) return '';
  return `<div style="display:flex;flex-direction:column;gap:2px;padding:2px">` +
    items.map(item => `<div style="background:${item.color};color:${item.fg||'#fff'};border-radius:3px;padding:2px 5px;font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;width:100%;box-sizing:border-box">${item.label}</div>`).join('') +
  `</div>`;
}

function renderWeeklyFull() {
  let d = new Date(cursor);
  let dow = d.getDay(); if (dow === 0) dow = 7;
  d.setDate(d.getDate() - (dow - 1));
  const weekDays = [];
  for (let i = 0; i < 5; i++) { weekDays.push(new Date(d)); d = new Date(d.getTime() + 86400000); }

  const mon = weekDays[0], fri = weekDays[4];
  $('#period-label').text(`${mon.getDate()} ${MONTHS_IT[mon.getMonth()]} – ${fri.getDate()} ${MONTHS_IT[fri.getMonth()]} ${fri.getFullYear()}`);

  const { minHour, maxHour } = calHourRange();
  const hours = Array.from({length: maxHour - minHour}, (_, i) => i + minHour);

  let headerHtml = '<div class="gwg-header-corner"></div>';
  weekDays.forEach((day, i) => {
    const isToday = isSameDay(day, today) ? ' style="color:#3b7fd4"' : '';
    headerHtml += `<div class="gwg-header-cell"${isToday}>${DAYS_SHORT[i]} ${day.getDate()}</div>`;
  });

  let rowsHtml = '';
  hours.forEach(hour => {
    rowsHtml += `<div class="gwg-row"><div class="gwg-time">${String(hour).padStart(2,'0')}:00</div>`;
    weekDays.forEach((day, di) => {
      const dateStr  = dateToYMD(day);
      const vacation = isVacationDay(dateStr);
      const cellDow  = day.getDay() === 0 ? 7 : day.getDay();

      if (vacation) {
        rowsHtml += `<div class="time-slot-cell" style="background:#dc2626;position:relative"><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:600">${vacation.name}</div></div>`;
        return;
      }

      // check if any therapist available at this hour
      const anyAvail = !calPeriodData?.availabilities?.length ||
        (calPeriodData.availabilities || []).some(a => a.dayOfWeek === cellDow && hour >= a.startHour && hour < a.endHour);

      const bg = anyAvail ? '' : 'background:#F3d3d1;';
      const items = getCellItems(dateStr, hour);
      rowsHtml += `<div class="time-slot-cell" style="${bg}position:relative">${renderCellItems(items)}</div>`;
    });
    rowsHtml += '</div>';
  });

  $('#view-weekly').html(`<div class="uso-header"><button class="btn-secondary no-print" onclick="printCalendarView()">🖨 Stampa</button></div><div class="group-week-grid" style="border-radius:0;border:none"><div class="gwg-header">${headerHtml}</div>${rowsHtml}</div>`);
}

function renderDailyFull() {
  if (isWeekend(cursor)) { while (isWeekend(cursor)) cursor = new Date(cursor.getTime() + 86400000); }
  const dayName = DAYS_IT[cursor.getDay() - 1];
  const label   = `${dayName}, ${cursor.getDate()} ${MONTHS_IT[cursor.getMonth()]} ${cursor.getFullYear()}`;
  $('#period-label').text(label);

  const dateStr  = dateToYMD(cursor);
  const vacation = isVacationDay(dateStr);
  const { minHour, maxHour } = calHourRange();
  const hours = Array.from({length: maxHour - minHour}, (_, i) => i + minHour);
  const dow = cursor.getDay() === 0 ? 7 : cursor.getDay();

  let rowsHtml = '';
  if (vacation) {
    rowsHtml = `<div style="padding:24px;background:#dc2626;color:#fff;font-size:16px;font-weight:600;text-align:center">${vacation.name} — giornata festiva</div>`;
  } else {
    hours.forEach(hour => {
      const anyAvail = !calPeriodData?.availabilities?.length ||
        (calPeriodData.availabilities || []).some(a => a.dayOfWeek === dow && hour >= a.startHour && hour < a.endHour);
      const bg = anyAvail ? '' : 'background:#F3d3d1;';
      const items = getCellItems(dateStr, hour);
      rowsHtml += `<div class="gwg-row"><div class="gwg-time">${String(hour).padStart(2,'0')}:00</div><div class="time-slot-cell" style="${bg}position:relative;height:60px">${renderCellItems(items)}</div></div>`;
    });
  }

  const el = $('<div>').html(`<div class="daily-header"><h2>${label}</h2></div><div class="group-week-grid" style="border-radius:0;border:none;border-top:1px solid #e0e3ea">${rowsHtml}</div>`);
  $('#view-daily').html(el.html());

  // swipe
  const elDom = $('#view-daily')[0];
  let startX = null;
  elDom.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  elDom.addEventListener('touchend', e => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 50) navigate(dx < 0 ? 1 : -1);
    startX = null;
  }, { passive: true });
}

// ── Therapist dropdown helper ─────────────────────────────────
async function loadTherapists() {
  const users = await apiGet('api/admin/users');
  allTherapists = users.filter(u => !!(u.roles & ROLES.Therapist) && !u.isSuspended && u.loginName.toLowerCase() !== 'admin');
}

async function loadStructuresAndInit() {
  const roles = parseInt(currentUser?.roles || 0);
  const isAdmin = !!(roles & ROLES.Admin);

  // set default structure from user's structureId
  calStructureId = currentUser.structureId || 1;

  try {
    const structures = await apiGet('api/structures');
    const opts = structures.map(s =>
      `<option value="${s.id}" ${s.id == calStructureId ? 'selected' : ''}>${s.name}</option>`
    ).join('');
    $('#topbar-structure').html(opts);
  } catch {}

  await loadTherapists();
  if (isAdmin || !!(roles & ROLES.Therapist)) {
    populateTherapistSelect('#cal-therapist-select');
  }
}

function populateTherapistSelect(selector) {
  const cur        = $(selector).val();
  const emptyLabel = selector === '#cal-therapist-select' ? 'Tutti' : '— seleziona —';
  $(selector).html(`<option value="">${emptyLabel}</option>` +
    allTherapists.map(t => `<option value="${t.id}" ${t.id == cur ? 'selected' : ''}>${t.fullName}</option>`).join(''));
}

// ── Admin Users ───────────────────────────────────────────────
$(document).on('click', '#btn-new-user', () => showUserForm(null));

async function loadUsers() {
  const users = await apiGet('api/admin/users');
  $('#users-tbody').html(users
    .filter(u => u.loginName.toLowerCase() !== 'admin')
    .map(u => {
      const roles = [];
      if (u.roles & ROLES.Admin)     roles.push('Admin');
      if (u.roles & ROLES.Therapist) roles.push('Terapista');
      const badge = u.isSuspended
        ? '<span class="badge badge-suspended">Sospeso</span>'
        : '<span class="badge badge-active">Attivo</span>';
      const color = COLORS[u.color] || COLORS[0];
      return `<tr style="cursor:pointer" data-id="${u.id}">
        <td><span class="color-dot" style="background:${color}"></span></td>
        <td>${u.fullName}</td><td>${u.loginName}</td><td>${u.email}</td>
        <td>${u.phone}</td><td>${roles.join(', ') || '–'}</td><td>${badge}</td>
      </tr>`;
    }).join(''));
}

$(document).on('click', '#users-tbody tr', function() { showUserForm($(this).data('id')); });

function colorPickerHtml(selectedIndex) {
  return COLORS.map((c, i) =>
    `<button type="button" class="color-swatch${i === selectedIndex ? ' selected' : ''}" style="background:${c}" data-color="${i}" title="Colore ${i+1}"></button>`
  ).join('');
}

$(document).on('click', '.color-swatch', function() {
  $('.color-swatch').removeClass('selected');
  $(this).addClass('selected');
  $('#uf-color-val').val($(this).data('color'));
});

let userFormOriginal = null;

function getUserFormValues() {
  return {
    fullname: $('#uf-fullname').val(),
    login:    $('#uf-login').val(),
    email:    $('#uf-email').val(),
    phone:    $('#uf-phone').val(),
    password: $('#uf-password').val(),
    color:    $('#uf-color-val').val(),
    roleAdmin:     $('#uf-role-admin').is(':checked'),
    roleTherapist: $('#uf-role-therapist').is(':checked'),
    structure: $('#uf-structure').val()
  };
}

function isUserFormDirty() {
  if (!userFormOriginal) return false;
  const cur = getUserFormValues();
  return JSON.stringify(cur) !== JSON.stringify(userFormOriginal);
}

async function showUserForm(id) {
  const isNew = id === null;
  let structures = [];
  try { structures = await apiGet('api/structures'); } catch {}
  const structOpts = '<option value="">– Nessuna –</option>' +
    structures.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

  $('#user-form-container').html(`
    <div class="form-box">
      <h2>${isNew ? 'Nuovo utente' : 'Modifica utente'}</h2>
      <div class="form-row">
        <div><label>Nome completo</label><input id="uf-fullname" type="text"></div>
        <div><label>Login</label><input id="uf-login" type="text"></div>
      </div>
      <div class="form-row">
        <div><label>Email</label><input id="uf-email" type="email"></div>
        <div><label>Telefono</label><input id="uf-phone" type="text"></div>
      </div>
      <div class="form-row">
        <div><label>Password${isNew ? ' *' : ' (lascia vuota per non cambiare)'}</label><input id="uf-password" type="password"></div>
        <div><label>Conferma password${isNew ? ' *' : ''}</label><input id="uf-password2" type="password"></div>
      </div>
      <span class="field-error hidden" id="uf-pwd-err"></span>
      <div>
        <label>Colore</label>
        <div class="color-picker" id="color-picker-wrap">${colorPickerHtml(0)}</div>
        <input type="hidden" id="uf-color-val" value="0">
      </div>
      <div>
        <label>Ruoli</label>
        <div style="display:flex;gap:16px;margin-top:6px">
          <label class="form-check"><input type="checkbox" id="uf-role-admin"> Admin</label>
          <label class="form-check"><input type="checkbox" id="uf-role-therapist"> Terapista</label>
        </div>
      </div>
      <div id="uf-structure-row">
        <label>Struttura *</label>
        <select id="uf-structure">${structOpts}</select>
      </div>
      <div id="avail-section"></div>
      <div class="form-actions" style="margin-top:16px">
        <button class="btn-primary" id="btn-save-user" data-id="${id}">Salva</button>
        <button class="btn-secondary" id="btn-cancel-user">Annulla</button>
      </div>
      ${!isNew ? `
      <div class="suspend-zone">
        <p>⚠ Zona a rischio — questa operazione sospende l'utente in modo permanente</p>
        <button class="btn-danger" id="btn-suspend-user" data-id="${id}">⚠ Sospendi utente</button>
      </div>` : ''}
    </div>
  `).removeClass('hidden');

  if (!isNew) {
    await loadUserIntoForm(id);
  }
  // capture original values after form is populated
  userFormOriginal = getUserFormValues();
}

$(document).on('click', '#btn-cancel-user', () => {
  if (isUserFormDirty() && !confirm('Vuoi abbandonare le modifiche?')) return;
  userFormOriginal = null;
  $('#user-form-container').addClass('hidden');
});

$(document).on('change', '#uf-role-therapist', function() {
  const checked = $(this).is(':checked');
  const id = parseInt($('#btn-save-user').data('id')) || null;
  $('#uf-structure-row').toggleClass('hidden', !checked);
  if (checked && id) loadAvailabilityGrid(id);
  else if (checked) $('#avail-section').html('<p style="font-size:12px;color:#6b7280;margin-top:12px">Salva prima l\u2019utente per poter definire la disponibilit\u00e0.</p>');
  else $('#avail-section').html('');
});

async function loadUserIntoForm(id) {
  const users = await apiGet('api/admin/users');
  const u = users.find(x => x.id === id);
  if (!u) return;
  $('#uf-fullname').val(u.fullName);
  $('#uf-login').val(u.loginName);
  $('#uf-email').val(u.email);
  $('#uf-phone').val(u.phone);
  $('#uf-role-admin').prop('checked', !!(u.roles & ROLES.Admin));
  $('#uf-role-therapist').prop('checked', !!(u.roles & ROLES.Therapist));
  $('#color-picker-wrap').html(colorPickerHtml(u.color));
  $('#uf-color-val').val(u.color);
  if (u.structureId) $('#uf-structure').val(u.structureId);
  if (u.roles & ROLES.Therapist) {
    await loadAvailabilityGrid(id);
  }
}

$(document).on('click', '#btn-save-user', async function() {
  const id    = $(this).data('id') === 'null' || $(this).data('id') === null ? null : parseInt($(this).data('id'));
  const isNew = id === null;
  const pwd   = $('#uf-password').val();
  const pwd2  = $('#uf-password2').val();
  $('#uf-pwd-err').addClass('hidden');

  if (isNew && !pwd) { $('#uf-pwd-err').text('La password è obbligatoria').removeClass('hidden'); return; }
  if (pwd && pwd !== pwd2) { $('#uf-pwd-err').text('Le password non coincidono').removeClass('hidden'); return; }

  let roles = 0;
  if ($('#uf-role-admin').is(':checked'))     roles |= ROLES.Admin;
  if ($('#uf-role-therapist').is(':checked')) roles |= ROLES.Therapist;

  const isTherapist  = !!(roles & ROLES.Therapist);
  const structureVal = $('#uf-structure').val();
  const structureId  = isTherapist && structureVal ? parseInt(structureVal) : null;

  const body = {
    loginName: $('#uf-login').val().trim(),
    fullName:  $('#uf-fullname').val().trim(),
    email:     $('#uf-email').val().trim(),
    phone:     $('#uf-phone').val().trim(),
    password:  pwd,
    color:     parseInt($('#uf-color-val').val()),
    roles, structureId
  };

  try {
    const url = isNew ? 'api/admin/users' : `api/admin/users/${id}`;
    const res = isNew ? await apiPost(url, body) : await apiPut(url, body);
    const userId = isNew ? res.id : id;

    if (isTherapist) await saveAvailability(userId);

    userFormOriginal = null;
    $('#user-form-container').addClass('hidden');
    allTherapists = [];
    await loadTherapists();
    populateTherapistSelect('#cal-therapist-select');
    populateTherapistSelect('#gf-therapist');
    loadUsers();
  } catch (xhr) {
    alert(xhr.responseJSON?.error || 'Errore durante il salvataggio');
  }
});

$(document).on('click', '#btn-suspend-user', async function() {
  const id = parseInt($(this).data('id'));
  if (!confirm('Confermi la sospensione di questo utente?')) return;
  try {
    await apiPost(`api/admin/users/${id}/suspend`, {});
    $('#user-form-container').addClass('hidden');
    loadUsers();
  } catch {}
});

// ── Availability ──────────────────────────────────────────────
let availState = [[], [], [], [], []];

async function loadAvailabilityGrid(userId) {
  const slots = await apiGet(`api/admin/users/${userId}/availability`);
  availState = [[], [], [], [], []];
  slots.forEach(s => {
    const idx = s.dayOfWeek - 1;
    if (idx >= 0 && idx < 5) availState[idx].push({ start: parseInt(s.startTime), end: parseInt(s.endTime) });
  });
  renderAvailabilityGrid(userId);
}

function renderAvailabilityGrid(userId) {
  const section = $('#avail-section');
  const dayCols = DAYS_IT.map((name, di) => {
    const slots = availState[di].map((slot, si) => `
      <div class="avail-slot">
        <input type="number" id="avail-start-${di}-${si}" value="${slot.start}" min="6" max="22" style="width:56px">
        <span class="avail-sep">→</span>
        <input type="number" id="avail-end-${di}-${si}" value="${slot.end}" min="6" max="22" style="width:56px">
        <button class="avail-remove" data-di="${di}" data-si="${si}" title="Rimuovi">×</button>
      </div>`).join('');
    const addDisabled = availState[di].length >= 2 ? 'disabled' : '';
    return `<div class="avail-day">
      <div class="avail-day-name">${name}</div>
      <div id="avail-slots-${di}">${slots}</div>
      <button class="avail-add" data-di="${di}" ${addDisabled}>+</button>
      <div class="avail-error" id="avail-err-${di}"></div>
    </div>`;
  }).join('');

  section.data('userId', userId).html(`
    <div class="availability-section">
      <h4>Disponibilità settimanale</h4>
      <div class="availability-grid">${dayCols}</div>
    </div>
  `);
}

function syncAvailStateFromInputs() {
  for (let di = 0; di < 5; di++) {
    for (let si = 0; si < availState[di].length; si++) {
      const sv = parseInt($(`#avail-start-${di}-${si}`).val());
      const ev = parseInt($(`#avail-end-${di}-${si}`).val());
      if (!isNaN(sv)) availState[di][si].start = sv;
      if (!isNaN(ev)) availState[di][si].end   = ev;
    }
  }
}

$(document).on('click', '.avail-remove', function() {
  syncAvailStateFromInputs();
  const di = parseInt($(this).data('di')), si = parseInt($(this).data('si'));
  availState[di].splice(si, 1);
  renderAvailabilityGrid($('#avail-section').data('userId'));
});

$(document).on('click', '.avail-add', function() {
  syncAvailStateFromInputs();
  const di = parseInt($(this).data('di'));
  if (availState[di].length >= 2) return;
  availState[di].push({ start: 8, end: 12 });
  renderAvailabilityGrid($('#avail-section').data('userId'));
});

async function saveAvailability(userId) {
  syncAvailStateFromInputs();
  const slots = [];
  let hasError = false;
  for (let di = 0; di < 5; di++) {
    $(`#avail-err-${di}`).text('');
    for (let si = 0; si < availState[di].length; si++) {
      const startRaw = parseInt($(`#avail-start-${di}-${si}`).val()) || availState[di][si].start;
      const endRaw   = parseInt($(`#avail-end-${di}-${si}`).val())   || availState[di][si].end;
      if (isNaN(startRaw) || isNaN(endRaw)) { $(`#avail-err-${di}`).text('Orari non validi'); hasError = true; continue; }
      if (startRaw >= endRaw) { $(`#avail-err-${di}`).text("L'inizio deve precedere la fine"); hasError = true; continue; }
      const fmt = h => `${String(h).padStart(2,'0')}:00`;
      slots.push({ dayOfWeek: di+1, startTime: fmt(startRaw), endTime: fmt(endRaw) });
    }
  }
  if (hasError) throw new Error('Availability validation failed');
  await apiPost(`api/admin/users/${userId}/availability`, slots);
}

// ── Patients ──────────────────────────────────────────────────
let patientSortTimer = null;

$(document).on('input', '#patient-search', () => {
  clearTimeout(patientSortTimer);
  patientSortTimer = setTimeout(() => {
    patientSearch = $('#patient-search').val().trim();
    patientPage = 1;
    loadPatients();
  }, 300);
});

$(document).on('click', '.sort-btn', function() {
  const field = $(this).data('sort');
  if (patientSortBy === field) { toggleSortDir(); return; }
  patientSortBy = field;
  patientPage   = 1;
  $('.sort-btn').removeClass('active');
  $(this).addClass('active');
  loadPatients();
});

$(document).on('click', '#sort-dir-btn', toggleSortDir);

function toggleSortDir() {
  patientSortDir = patientSortDir === 'asc' ? 'desc' : 'asc';
  $('#sort-dir-btn').toggleClass('desc', patientSortDir === 'desc');
  patientPage = 1;
  loadPatients();
}

async function loadPatients() {
  const params = new URLSearchParams({ page: patientPage, sortBy: patientSortBy, sortDir: patientSortDir });
  if (patientSearch) params.set('search', patientSearch);
  const data = await apiGet('api/patients?' + params.toString());
  data.items.forEach(p => patientCache[p.id] = p);
  renderPatientList(data.items);
  renderPagination(data.total, data.pageSize, data.page);
}

function renderPatientList(patients) {
  if (!patients.length) { $('#patient-list').html('<div class="patient-empty">Nessun paziente trovato</div>'); return; }
  const header = `<div class="patient-row patient-row-header">
    <span>Nome</span><span>Sesso</span><span>Telefono</span><span>Preferenza</span><span>Gruppo</span><span>Azioni</span>
  </div>`;
  const rows = patients.map(p => {
    const gruppo = p.inGruppo ? 'Sì' : '';
    return `<div class="patient-row" style="cursor:pointer" data-id="${p.id}">
      <span class="patient-name">${p.fullName}</span>
      <span class="patient-sesso">${p.sesso}</span>
      <span class="patient-phone">${formatPhoneLink(p.telefono)}</span>
      <span class="patient-pref">${p.preferenzaOrario || '–'}</span>
      <span>${gruppo}</span>
      <span></span>
    </div>`;
  }).join('');
  $('#patient-list').html(header + rows);
}

$(document).on('click', '.patient-row:not(.patient-row-header)', function(e) {
  if ($(e.target).is('button')) return;
  openPatientDetail(parseInt($(this).data('id')));
});
$(document).on('click', '.btn-edit-patient', function(e) {
  e.stopPropagation();
  showPatientForm(parseInt($(this).data('id')));
});

function renderPagination(total, pageSize, current) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) { $('#patient-pagination').html(''); return; }
  let html = `<button ${current===1?'disabled':''} data-page="${current-1}">&#8249;</button>`;
  for (let i = 1; i <= totalPages; i++) html += `<button class="${i===current?'active':''}" data-page="${i}">${i}</button>`;
  html += `<button ${current===totalPages?'disabled':''} data-page="${current+1}">&#8250;</button>`;
  $('#patient-pagination').html(html);
}
$(document).on('click', '#patient-pagination button:not(:disabled)', function() {
  patientPage = parseInt($(this).data('page'));
  loadPatients();
});

$(document).on('click', '#btn-new-patient', () => showPatientForm(null));

function showPatientForm(id) {
  const isNew = id === null;
  const container = $('#patient-form-container');
  container.html(`
    <div class="patient-form-box">
      <h3>${isNew ? 'Nuovo paziente' : 'Modifica paziente'}</h3>
      <div class="patient-form-grid">
        <div class="form-field">
          <label>Nome completo *</label>
          <input id="pf-name" type="text" placeholder="Nome Cognome">
          <span class="field-error hidden" id="pf-name-err"></span>
        </div>
        <div class="form-field">
          <label>Sesso *</label>
          <select id="pf-sesso"><option value="M">Maschio</option><option value="F">Femmina</option></select>
        </div>
        <div class="form-field">
          <label>Codice Fiscale</label>
          <input id="pf-cf" type="text" maxlength="16" placeholder="AAABBB00A00A123B">
        </div>
      </div>
      <div class="patient-form-grid2">
        <div class="form-field">
          <label>Telefono *</label>
          <input id="pf-phone" type="text" placeholder="333 12 34 567">
          <span class="field-error hidden" id="pf-phone-err"></span>
        </div>
        <div class="form-field">
          <label>Preferenza orario</label>
          <input id="pf-pref" type="text" placeholder="es. Mattino">
          <div class="pref-quick">
            <button type="button" class="pref-btn" data-val="Nessuna preferenza">Nessuna</button>
            <button type="button" class="pref-btn" data-val="Mattino">Mattino</button>
            <button type="button" class="pref-btn" data-val="Pomeriggio">Pomeriggio</button>
          </div>
        </div>
        <div class="form-field">
          <label>Struttura preferita</label>
          <select id="pf-structure">
            <option value="">Indifferente</option>
            <option value="1">Ponti Rossi</option>
            <option value="2">Porcellane</option>
          </select>
        </div>
      </div>
      <div class="form-field" style="margin-bottom:4px">
        <label class="form-check"><input type="checkbox" id="pf-gruppo"> Disponibile per terapie di gruppo</label>
      </div>
      <div class="form-actions">
        <button class="btn-primary" id="btn-save-patient" data-id="${id}">Salva</button>
        <button class="btn-secondary" id="btn-cancel-patient">Annulla</button>
      </div>
      ${!isNew ? `
      <div class="delete-zone">
        <p>Per eliminare il paziente, digita il nome completo e premi Elimina.</p>
        <div class="delete-row">
          <input type="text" id="pf-delete-confirm" placeholder="Digita il nome completo…">
          <button class="btn-danger" id="btn-delete-patient" data-id="${id}" disabled>Elimina</button>
        </div>
      </div>` : ''}
    </div>
  `).removeClass('hidden');

  if (isNew) {
    $('#pf-sesso').val('M');
  } else if (patientCache[id]) {
    loadPatientData(patientCache[id]);
  }
}

$(document).on('input', '#pf-name', function() { $(this).val(capitalizeName($(this).val())); });
$(document).on('input', '#pf-cf',   function() { $(this).val($(this).val().toUpperCase()); });
$(document).on('input', '#pf-phone', function() { $(this).val($(this).val().replace(/\D/g,'')); });
$(document).on('click', '.pref-btn', function() { $('#pf-pref').val($(this).data('val')); });
$(document).on('click', '#btn-cancel-patient', () => $('#patient-form-container').addClass('hidden'));
$(document).on('input', '#pf-delete-confirm', function() {
  const name = $('#pf-name').val().trim();
  $('#btn-delete-patient').prop('disabled', $(this).val().trim() !== name);
});

function loadPatientData(p) {
  $('#pf-name').val(p.fullName);
  $('#pf-sesso').val(p.sesso);
  $('#pf-cf').val(p.codiceFiscale);
  $('#pf-phone').val(p.telefono);
  $('#pf-pref').val(p.preferenzaOrario);
  $('#pf-gruppo').prop('checked', p.inGruppo);
  $('#pf-structure').val(p.preferredStructureId || '');
}

$(document).on('click', '#btn-save-patient', async function() {
  const id    = $(this).data('id') === 'null' || $(this).data('id') === null ? null : parseInt($(this).data('id'));
  const isNew = id === null;
  const name  = $('#pf-name').val().trim();
  const phone = $('#pf-phone').val().trim();
  let valid   = true;

  if (name.split(/\s+/).filter(w => w).length < 2) {
    $('#pf-name-err').text('Inserire almeno nome e cognome').removeClass('hidden');
    $('#pf-name').addClass('error');
    valid = false;
  } else { $('#pf-name-err').addClass('hidden'); $('#pf-name').removeClass('error'); }

  if (!phone) {
    $('#pf-phone-err').text('Il numero di telefono è obbligatorio').removeClass('hidden');
    $('#pf-phone').addClass('error');
    valid = false;
  } else { $('#pf-phone-err').addClass('hidden'); $('#pf-phone').removeClass('error'); }

  if (!valid) return;

  const structVal = $('#pf-structure').val();
  const body = {
    fullName:            name,
    codiceFiscale:       $('#pf-cf').val().trim(),
    sesso:               $('#pf-sesso').val(),
    telefono:            phone,
    preferenzaOrario:    $('#pf-pref').val().trim(),
    inGruppo:            $('#pf-gruppo').is(':checked'),
    preferredStructureId: structVal ? parseInt(structVal) : null
  };

  try {
    const url = isNew ? 'api/patients' : `api/patients/${id}`;
    if (isNew) await apiPost(url, body); else await apiPut(url, body);
    $('#patient-form-container').addClass('hidden');
    loadPatients();
  } catch {}
});

$(document).on('click', '#btn-delete-patient', async function() {
  const id = parseInt($(this).data('id'));
  await apiDelete(`api/patients/${id}`);
  $('#patient-form-container').addClass('hidden');
  loadPatients();
});

// ── Patient detail ────────────────────────────────────────────
function renderPatientInfo(p, isAdmin) {
  const sesso    = p.sesso || '–';
  const tel      = formatPhone(p.telefono);
  const cf       = p.codiceFiscale || '–';
  const pref     = p.preferenzaOrario || '–';
  const gruppo   = p.inGruppo ? 'Sì' : 'No';
  const struttura = structureName(p.preferredStructureId);
  const inserted = new Date(p.dataInserimento).toLocaleDateString('it-IT');

  $('#detail-patient-info').html(`
    <div class="detail-block" style="margin-bottom:16px">
      <div class="detail-block-header"><span>Dati paziente</span>
        ${isAdmin ? `<button class="btn-secondary btn-edit-detail-patient" data-id="${p.id}">Modifica</button>` : ''}
      </div>
      <div style="padding:16px 20px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;font-size:13px">
        <div><div class="info-label">Sesso</div>${sesso}</div>
        <div><div class="info-label">Telefono</div>${tel}</div>
        <div><div class="info-label">Codice Fiscale</div>${cf}</div>
        <div><div class="info-label">Preferenza</div>${pref}</div>
        <div><div class="info-label">In gruppo</div>${gruppo}</div>
        <div><div class="info-label">Struttura preferita</div>${struttura}</div>
        <div><div class="info-label">Inserito il</div>${inserted}</div>
      </div>
    </div>`);
}

async function openPatientDetail(patientId, returnSection = 'pazienti-elenco') {
  currentPatientId      = patientId;
  showArchivedTherapies = false;
  patientEditMode       = false;
  history.pushState({ section: currentSection }, '');

  const p = patientCache[patientId];
  $('.section').addClass('hidden');
  $('#section-patient-detail').removeClass('hidden').data('returnSection', returnSection);
  $('#detail-patient-name').text(p ? p.fullName : '');
  $('#detail-patient-form').addClass('hidden');

  const isAdmin = !!(parseInt(currentUser.roles) & ROLES.Admin);
  if (isAdmin) $('#btn-new-therapy').removeClass('hidden');
  else $('#btn-new-therapy').addClass('hidden');

  if (p) renderPatientInfo(p, isAdmin);

  const [ptRes, thRes] = await Promise.all([
    apiGet('api/paymenttypes/active'),
    apiGet(`api/patients/${patientId}/therapies`)
  ]);
  paymentTypes = ptRes;
  allTherapies = thRes;
  renderTherapyList();
}

$(document).on('click', '.pref-btn-detail', function() { $('#dpf-pref').val($(this).data('val')); });
$(document).on('input', '#dpf-name', function() { $(this).val(capitalizeName($(this).val())); });
$(document).on('input', '#dpf-cf',   function() { $(this).val($(this).val().toUpperCase()); });
$(document).on('input', '#dpf-phone', function() { $(this).val($(this).val().replace(/\D/g,'')); });
$(document).on('input', '#dpf-delete-confirm', function() {
  const name = $('#dpf-name').val().trim();
  $('#btn-delete-detail-patient').prop('disabled', $(this).val().trim() !== name);
});

$(document).on('click', '#btn-cancel-detail-patient', () => {
  patientEditMode = false;
  $('#detail-patient-form').addClass('hidden');
  $('#detail-patient-info').removeClass('hidden');
});

$(document).on('click', '#btn-save-detail-patient', async function() {
  const id    = parseInt($(this).data('id'));
  const name  = $('#dpf-name').val().trim();
  const phone = $('#dpf-phone').val().trim();
  let valid   = true;

  if (name.split(/\s+/).filter(w => w).length < 2) {
    $('#dpf-name-err').text('Inserire almeno nome e cognome').removeClass('hidden');
    valid = false;
  } else { $('#dpf-name-err').addClass('hidden'); }

  if (!phone) {
    $('#dpf-phone-err').text('Il numero di telefono è obbligatorio').removeClass('hidden');
    valid = false;
  } else { $('#dpf-phone-err').addClass('hidden'); }

  if (!valid) return;

  const structVal = $('#dpf-structure').val();
  const body = {
    fullName:            name,
    codiceFiscale:       $('#dpf-cf').val().trim(),
    sesso:               $('#dpf-sesso').val(),
    telefono:            phone,
    preferenzaOrario:    $('#dpf-pref').val().trim(),
    inGruppo:            $('#dpf-gruppo').is(':checked'),
    preferredStructureId: structVal ? parseInt(structVal) : null
  };

  try {
    await apiPut(`api/patients/${id}`, body);
    // update cache and re-render
    patientCache[id] = { ...patientCache[id], ...body, preferredStructureId: body.preferredStructureId };
    $('#detail-patient-name').text(name);
    patientEditMode = false;
    $('#detail-patient-form').addClass('hidden');
    $('#detail-patient-info').removeClass('hidden');
    const isAdmin = !!(parseInt(currentUser.roles) & ROLES.Admin);
    renderPatientInfo(patientCache[id], isAdmin);
  } catch (xhr) {
    alert(xhr.responseJSON?.error || 'Errore durante il salvataggio');
  }
});

$(document).on('click', '#btn-delete-detail-patient', async function() {
  const id = parseInt($(this).data('id'));
  await apiDelete(`api/patients/${id}`);
  delete patientCache[id];
  navTo('pazienti-elenco');
});

$(document).on('click', '#btn-back-patients', () => {
  const ret = $('#section-patient-detail').data('returnSection') || 'pazienti-elenco';
  currentPatientId = null;
  $('#patient-form-container').addClass('hidden');
  navTo(ret);
});

$(document).on('click', '.btn-edit-detail-patient', function() {
  const id = parseInt($(this).data('id'));
  const p  = patientCache[id];
  if (!p) return;
  patientEditMode = true;

  // render edit form inside detail section
  const structOpts = `<option value="">Indifferente</option>
    <option value="1" ${p.preferredStructureId===1?'selected':''}>Ponti Rossi</option>
    <option value="2" ${p.preferredStructureId===2?'selected':''}>Porcellane</option>`;

  $('#detail-patient-form').html(`
    <div class="patient-form-box" style="margin-bottom:16px">
      <h3>Modifica paziente</h3>
      <div class="patient-form-grid">
        <div class="form-field">
          <label>Nome completo *</label>
          <input id="dpf-name" type="text" value="${p.fullName}">
          <span class="field-error hidden" id="dpf-name-err"></span>
        </div>
        <div class="form-field">
          <label>Sesso *</label>
          <select id="dpf-sesso">
            <option value="M" ${p.sesso==='M'?'selected':''}>Maschio</option>
            <option value="F" ${p.sesso==='F'?'selected':''}>Femmina</option>
          </select>
        </div>
        <div class="form-field">
          <label>Codice Fiscale</label>
          <input id="dpf-cf" type="text" maxlength="16" value="${p.codiceFiscale || ''}">
        </div>
      </div>
      <div class="patient-form-grid2">
        <div class="form-field">
          <label>Telefono *</label>
          <input id="dpf-phone" type="text" value="${p.telefono}">
          <span class="field-error hidden" id="dpf-phone-err"></span>
        </div>
        <div class="form-field">
          <label>Preferenza orario</label>
          <input id="dpf-pref" type="text" value="${p.preferenzaOrario || ''}">
          <div class="pref-quick">
            <button type="button" class="pref-btn-detail" data-val="Nessuna preferenza">Nessuna</button>
            <button type="button" class="pref-btn-detail" data-val="Mattino">Mattino</button>
            <button type="button" class="pref-btn-detail" data-val="Pomeriggio">Pomeriggio</button>
          </div>
        </div>
        <div class="form-field">
          <label>Struttura preferita</label>
          <select id="dpf-structure">${structOpts}</select>
        </div>
      </div>
      <div class="form-field" style="margin-bottom:4px">
        <label class="form-check">
          <input type="checkbox" id="dpf-gruppo" ${p.inGruppo?'checked':''}> Disponibile per terapie di gruppo
        </label>
      </div>
      <div class="form-actions">
        <button class="btn-primary" id="btn-save-detail-patient" data-id="${id}">Salva</button>
        <button class="btn-secondary" id="btn-cancel-detail-patient">Annulla</button>
      </div>
      <div class="delete-zone">
        <p>⚠ Per eliminare il paziente, digita il nome completo e premi Elimina.</p>
        <div class="delete-row">
          <input type="text" id="dpf-delete-confirm" placeholder="Digita il nome completo…">
          <button class="btn-danger" id="btn-delete-detail-patient" data-id="${id}" disabled>Elimina</button>
        </div>
      </div>
    </div>
  `).removeClass('hidden');

  // hide info panel while editing
  $('#detail-patient-info').addClass('hidden');
});

$(document).on('click', '#btn-show-archived', function() {
  showArchivedTherapies = !showArchivedTherapies;
  $(this).text(showArchivedTherapies ? 'Nascondi completate/rifiutate' : 'Mostra completate/rifiutate');
  renderTherapyList();
});

$(document).on('click', '#btn-new-therapy', () => showTherapyForm(null));

function renderTherapyList() {
  const visible = allTherapies.filter(t => showArchivedTherapies ? true : (t.status !== 2 && t.status !== 3));
  const isAdmin = !!(parseInt(currentUser.roles) & ROLES.Admin);

  // show/hide print button based on started therapies
  const hasStarted = allTherapies.some(t => t.status === 1);
  if (hasStarted && isAdmin) $('#btn-print-scheduling').removeClass('hidden');
  else $('#btn-print-scheduling').addClass('hidden');

  if (!visible.length) { $('#therapy-list').html('<div class="therapy-empty">Nessuna terapia</div>'); return; }

  const header = `<div class="therapy-row therapy-row-header">
    <span>Tipo</span><span>Pagamento</span><span>Durata</span>
    <span>A pacchetto</span><span>Stato</span><span>Prescrizione</span><span></span>
  </div>`;

  const rows = visible.map(t => {
    const typeLabel   = THERAPY_TYPE_LABELS[t.type]   || '–';
    const statusLabel = THERAPY_STATUS_LABELS[t.status] || '–';
    const statusClass = THERAPY_STATUS_CLASS[t.status]  || '';
    const duration    = t.duration !== null && t.duration !== undefined ? t.duration : '–';
    const pacchetto   = t.type === 0 ? '–' : (t.aPacchetto ? 'Sì' : 'No');
    const pdf         = t.prescriptionPdfId ? `<a href="api/prescriptions/${t.prescriptionPdfId}" target="_blank">📄 Scarica</a>` : '–';
    const editBtn = isAdmin ? `<button class="btn-edit-therapy" data-id="${t.id}">Modifica</button>` : '';
    const pianBtn = isAdmin && t.status === 0 ? `<button class="btn-pianifica" data-id="${t.id}" style="font-size:11px;padding:3px 8px">Pianifica</button>` : '';
    const notes = t.notes ? `<span class="therapy-notes" title="${t.notes}">📝</span>` : '';
    return `<div class="therapy-row" data-id="${t.id}">
      <span>${typeLabel}</span><span>${t.paymentTypeName}</span>
      <span>${duration}</span><span>${pacchetto}</span>
      <span><span class="status-badge ${statusClass}">${statusLabel}</span></span>
      <span>${pdf} ${notes}</span>
      <span>${pianBtn} ${editBtn}</span>
    </div>`;
  }).join('');

  $('#therapy-list').html(header + rows);
}

// therapy rows are read-only unless in edit mode
$(document).on('click', '.btn-edit-therapy', function(e) { e.stopPropagation(); showTherapyForm(parseInt($(this).data('id'))); });
$(document).on('click', '.btn-pianifica',    function(e) { e.stopPropagation(); startPlanning(parseInt($(this).data('id'))); });

async function showTherapyForm(therapyId) {
  const isNew      = therapyId === null;
  const t          = isNew ? null : allTherapies.find(x => x.id === therapyId);
  const isAdmin    = !!(parseInt(currentUser.roles) & ROLES.Admin);
  if (!isAdmin) return;

  // ensure payment types are loaded
  if (!paymentTypes.length) {
    try { paymentTypes = await apiGet('api/paymenttypes/active'); } catch {}
  }

  const hasStarted = allTherapies.some(x => x.status === 1);
  const warning    = (!isNew || !hasStarted) ? '' :
    '<div class="error-msg" style="margin-bottom:12px">Attenzione: esiste già una terapia "In corso" per questo paziente.</div>';

  const typeVal    = t ? t.type   : 0;
  const statusVal  = t ? t.status : 0;
  const defaultDur = typeVal === 0 ? 180 : 10;
  const duration   = t ? (t.duration ?? defaultDur) : defaultDur;
  const pacchetto  = t ? t.aPacchetto : false;
  therapyDurationUserModified = false;

  const ptOptions = paymentTypes.map(pt =>
    `<option value="${pt.id}" ${t && t.paymentTypeId === pt.id ? 'selected' : ''}>${pt.name}</option>`
  ).join('');

  $('#therapy-form-container').html(`
    <div class="therapy-form-box">
      <h3>${isNew ? 'Nuova terapia' : 'Modifica terapia'}</h3>
      ${warning}
      <div class="therapy-form-grid">
        <div class="form-field">
          <label>Tipo *</label>
          <select id="tf-type">
            <option value="0" ${typeVal===0?'selected':''}>Legge 11</option>
            <option value="1" ${typeVal===1?'selected':''}>HKT Individuale</option>
            <option value="2" ${typeVal===2?'selected':''}>HKT Gruppo</option>
          </select>
        </div>
        <div class="form-field">
          <label>Pagamento *</label>
          <select id="tf-payment">${ptOptions}</select>
        </div>
        <div class="form-field">
          <label>Durata *</label>
          <input type="number" id="tf-duration" value="${duration}" min="1" required>
          <span style="font-size:11px;color:#6b7280" id="tf-duration-hint">${typeVal===0?'Giorni di durata':'Numero di sessioni'}</span>
        </div>
      </div>
      ${!isNew ? `
      <div class="form-field" style="max-width:200px">
        <label>Stato</label>
        <select id="tf-status">
          <option value="0" ${statusVal===0?'selected':''}>Da iniziare</option>
          <option value="1" ${statusVal===1?'selected':''}>In corso</option>
          <option value="2" ${statusVal===2?'selected':''}>Completata</option>
          <option value="3" ${statusVal===3?'selected':''}>Rifiutata</option>
        </select>
      </div>` : ''}
      <div id="tf-hkt-fields" style="display:${typeVal===0?'none':'block'};margin-top:8px">
        <label class="form-check"><input type="checkbox" id="tf-pacchetto" ${pacchetto?'checked':''}> A pacchetto</label>
      </div>
      <div class="form-field" style="margin-top:8px">
        <label>Note</label>
        <textarea id="tf-notes" rows="3" maxlength="256" style="resize:vertical;font-size:13px;padding:8px;border:1px solid #e0e3ea;border-radius:6px;width:100%;box-sizing:border-box">${t ? (t.notes || '') : ''}</textarea>
      </div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;margin-top:8px">
        <label style="white-space:nowrap;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.4px">Prescrizione PDF</label>
        ${t && t.prescriptionPdfId
          ? `<a href="api/prescriptions/${t.prescriptionPdfId}" target="_blank" style="font-size:13px;color:#3b7fd4;text-decoration:none">📄 Scarica</a>
             <button class="btn-secondary btn-remove-pdf" data-id="${t.id}">Rimuovi</button>`
          : ''}
        <input type="file" id="tf-pdf" accept="application/pdf" style="font-size:13px">
      </div>
      <div class="form-actions">
        <button class="btn-primary btn-save-therapy" data-id="${therapyId}">Salva</button>
        <button class="btn-secondary btn-cancel-therapy">Annulla</button>
        ${!isNew ? `<button class="btn-danger btn-delete-therapy" data-id="${therapyId}" style="margin-left:auto">Elimina</button>` : ''}
      </div>
    </div>
  `).removeClass('hidden');
}

$(document).on('change', '#tf-type', function() {
  const type = parseInt($(this).val());
  $('#tf-hkt-fields').toggle(type !== 0);
  const defaultVal = type === 0 ? 180 : 10;
  const cur = parseInt($('#tf-duration').val());
  if (!therapyDurationUserModified || cur === 10 || cur === 180) {
    $('#tf-duration').val(defaultVal);
    therapyDurationUserModified = false;
  }
  $('#tf-duration-hint').text(type === 0 ? 'Giorni di durata' : 'Numero di sessioni');
});

$(document).on('input', '#tf-duration', () => { therapyDurationUserModified = true; });
$(document).on('click', '.btn-cancel-therapy', () => { $('#therapy-form-container').addClass('hidden'); });

$(document).on('click', '.btn-save-therapy', async function() {
  const therapyId = $(this).data('id') === 'null' || $(this).data('id') === null ? null : parseInt($(this).data('id'));
  const isNew     = therapyId === null;
  const type      = parseInt($('#tf-type').val());
  const payment   = parseInt($('#tf-payment').val());
  const statusEl  = $('#tf-status');
  const status    = statusEl.length ? parseInt(statusEl.val()) : 0;
  const duration  = parseInt($('#tf-duration').val()) || 10;
  const pacchetto = type !== 0 && $('#tf-pacchetto').is(':checked');

  const notes = $('#tf-notes').val().trim() || null;
  const body = { type, paymentTypeId: payment, duration, aPacchetto: pacchetto, status, notes };

  try {
    const url = isNew
      ? `api/patients/${currentPatientId}/therapies`
      : `api/patients/${currentPatientId}/therapies/${therapyId}`;
    const res = isNew ? await apiPost(url, body) : await apiPut(url, body);
    const tid = isNew ? res.id : therapyId;

    const fileInput = $('#tf-pdf')[0];
    if (fileInput && fileInput.files.length > 0) {
      const fd = new FormData();
      fd.append('file', fileInput.files[0]);
      await $.ajax({ url: `api/patients/${currentPatientId}/therapies/${tid}/prescription`, method: 'POST', data: fd, processData: false, contentType: false });
    }

    $('#therapy-form-container').addClass('hidden');
    allTherapies = await apiGet(`api/patients/${currentPatientId}/therapies`);
    renderTherapyList();
  } catch (xhr) {
    alert(xhr.responseJSON?.error || 'Errore durante il salvataggio');
  }
});

$(document).on('click', '.btn-delete-therapy', async function() {
  const id = parseInt($(this).data('id'));
  if (!confirm('Eliminare questa terapia?')) return;
  await apiDelete(`api/patients/${currentPatientId}/therapies/${id}`);
  $('#therapy-form-container').addClass('hidden');
  allTherapies = await apiGet(`api/patients/${currentPatientId}/therapies`);
  renderTherapyList();
});

$(document).on('click', '.btn-remove-pdf', async function() {
  const id = parseInt($(this).data('id'));
  if (!confirm('Rimuovere la prescrizione PDF?')) return;
  await apiDelete(`api/patients/${currentPatientId}/therapies/${id}/prescription`);
  allTherapies = await apiGet(`api/patients/${currentPatientId}/therapies`);
  renderTherapyList();
  showTherapyForm(id);
});

// ── Waiting list ──────────────────────────────────────────────
let wlTimer = null;
$(document).on('change', '#wl-filter-type, #wl-filter-struttura, #wl-filter-gruppo', loadWaitingList);
$(document).on('input', '#wl-filter-preferenza', () => {
  clearTimeout(wlTimer);
  wlTimer = setTimeout(loadWaitingList, 300);
});

async function loadWaitingList() {
  const params = new URLSearchParams();
  const type = $('#wl-filter-type').val(), struttura = $('#wl-filter-struttura').val();
  const inGruppo = $('#wl-filter-gruppo').val(), preferenza = $('#wl-filter-preferenza').val().trim();
  if (type)       params.set('type', type);
  if (struttura)  params.set('struttura', struttura);
  if (inGruppo)   params.set('inGruppo', inGruppo);
  if (preferenza) params.set('preferenza', preferenza);

  const list = await apiGet('api/waitinglist?' + params.toString());
  if (!list.length) { $('#wl-list').html('<div class="wl-list-wrap"><div class="wl-empty">Nessuna terapia in attesa</div></div>'); return; }

  const header = `<div class="wl-row wl-row-header">
    <span>Paziente</span><span>Tipo terapia</span><span>Pagamento</span>
    <span>Struttura</span><span>Preferenza</span><span>In attesa dal</span>
  </div>`;
  const rows = list.map(item => {
    const typeLabel = THERAPY_TYPE_LABELS[item.type] || '–';
    const date      = new Date(item.createdAt).toLocaleDateString('it-IT');
    return `<div class="wl-row" style="cursor:pointer" data-patient="${item.patientId}">
      <span style="font-weight:500;color:#1a1a2e">${item.patientName}</span>
      <span>${typeLabel}</span><span>${item.paymentTypeName}</span>
      <span>${structureName(item.patientPreferredStructureId)}</span>
      <span>${item.patientPreferenza || '–'}</span>
      <span>${date}</span>
    </div>`;
  }).join('');
  $('#wl-list').html(`<div class="wl-list-wrap">${header}${rows}</div>`);
}

$(document).on('click', '#wl-list .wl-row:not(.wl-row-header)', async function() {
  const patientId = parseInt($(this).data('patient'));
  if (!patientCache[patientId]) {
    try { patientCache[patientId] = await apiGet(`api/patients/${patientId}`); } catch {}
  }
  openPatientDetail(patientId, 'pazienti-attesa');
});

// ── Print scheduling ──────────────────────────────────────────
$(document).on('click', '#btn-print-scheduling', async () => {
  const started = allTherapies.filter(t => t.status === 1);
  if (!started.length) return;

  const p = patientCache[currentPatientId];
  const logoUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/') + 'logoMinerva.png';

  let body = '';
  for (const t of started) {
    const slots = await apiGet(`api/patients/${currentPatientId}/therapies/${t.id}/slots`);
    // get therapist name from first slot
    const therapistName = slots.length > 0 ? (slots[0].therapistName || '') : '';

    body += `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px">
      <div>
        <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Paziente</div>
        <div style="font-size:18px;font-weight:600;color:#1a1a2e">${p?.fullName || ''}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Terapista</div>
        <div style="font-size:18px;font-weight:600;color:#1a1a2e">${therapistName}</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th><th>Data</th><th>Giorno</th><th>Ora</th><th>Stato</th>
        </tr>
      </thead>
      <tbody>`;

    slots.forEach((s, i) => {
      const d   = new Date(s.date + 'T00:00:00');
      const day = DAYS_IT[d.getDay() - 1] || '';
      const dt  = d.toLocaleDateString('it-IT');
      const hr  = String(s.startHour).padStart(2,'0') + ':00';
      const st  = ['Pianificato','Completato','Assente','Recupero'][s.status] || '–';
      body += `<tr><td>${i+1}</td><td>${dt}</td><td>${day}</td><td>${hr}</td><td>${st}</td></tr>`;
    });

    body += `</tbody></table><p style="margin-top:8px;font-size:12px;color:#9ca3af;text-align:right">Totale: ${slots.length} sedute</p>`;
  }

  const html = `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">
    <title>Pianificazione — ${p?.fullName || ''}</title>
    <style>
      @media print { .no-print { display:none!important; } }
      body { font-family: system-ui, sans-serif; padding: 32px; color: #1a1a2e; margin:0; }
      .header { display:flex; align-items:center; gap:20px; padding-bottom:20px; border-bottom:2px solid #e5e7eb; margin-bottom:24px; }
      .header h1 { font-size:22px; font-weight:700; margin:0; line-height:1.3; }
      .header h1 span { font-size:16px; font-weight:400; color:#6b7280; display:block; }
      table { width:100%; border-collapse:collapse; margin-bottom:16px; }
      th { background:#f3f4f6; padding:8px 12px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:#6b7280; border-bottom:2px solid #e5e7eb; }
      td { padding:8px 12px; border-bottom:1px solid #f0f0f0; font-size:13px; }
      tr:last-child td { border-bottom:none; }
    </style></head><body>
    <div class="no-print" style="margin-bottom:16px">
      <button onclick="window.print()" style="padding:8px 20px;background:#3b7fd4;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer">🖨 Stampa</button>
    </div>
    <div class="header">
      <img src="${logoUrl}" alt="Centro Minerva" style="width:80px;height:80px;object-fit:contain">
      <h1>Centro Minerva <span>Pianificazione Piscina</span></h1>
    </div>
    ${body}
    </body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
});

// ── Avvisi ───────────────────────────────────────────────────
let showDismissedAlerts = false;

$(document).on('click', '#btn-show-dismissed-alerts', () => {
  showDismissedAlerts = !showDismissedAlerts;
  $('#btn-show-dismissed-alerts').text(showDismissedAlerts ? 'Nascondi gestiti' : 'Mostra gestiti');
  loadAvvisi();
});

async function loadAvvisi() {
  const url = showDismissedAlerts ? 'api/alerts?includeDismissed=true' : 'api/alerts';
  const list = await apiGet(url);

  if (!list.length) {
    $('#avvisi-grid').html('<div style="padding:32px;text-align:center;color:#9ca3af;font-size:14px">Nessun avviso attivo</div>');
    return;
  }

  const THERAPY_LABELS = { 0: 'Legge 11', 1: 'HKT Individuale', 2: 'HKT Gruppo' };

  const html = list.map(a => {
    const isDismissed = !!a.dismissedAt;
    const lastDate    = a.lastSlotDate
      ? new Date(a.lastSlotDate + 'T00:00:00').toLocaleDateString('it-IT')
      : '–';
    const dimStyle    = isDismissed ? 'opacity:0.5;' : '';
    const seduteLabel = a.remainingSlots === 1 ? '1 seduta rimasta' : `${a.remainingSlots} sedute rimaste`;
    const pacchetto   = a.therapyTypeVal !== 0 ? (a.aPacchetto ? ' · A pacchetto' : '') : '';

    return `<div class="avviso-card" style="${dimStyle}" data-id="${a.id}">
      <div class="avviso-header">
        <div>
          <div class="avviso-patient">${a.patientName}</div>
          <div class="avviso-type">${THERAPY_LABELS[a.therapyTypeVal] || '–'}</div>
        </div>
        <div class="avviso-badge">
          ${a.remainingSlots === 0
            ? '<span class="badge badge-suspended">Terminata</span>'
            : `<span class="badge" style="background:#fef3c7;color:#92400e">${seduteLabel}</span>`}
        </div>
      </div>
      <div class="avviso-info">
        <div>${formatPhoneLink(a.patientPhone)}</div>
        <div style="font-size:12px;color:#6b7280">Terapista: ${a.therapistName}</div>
        <div style="font-size:12px;color:#6b7280">Struttura: ${a.structureName}</div>
        <div style="font-size:12px;color:#6b7280">Pagamento: ${a.paymentTypeName}${pacchetto}</div>
        <div style="font-size:12px;color:#6b7280">Ultima seduta: ${lastDate}</div>
      </div>
      <textarea class="avviso-notes" data-id="${a.id}" placeholder="Note..." maxlength="512"
        rows="2">${a.notes || ''}</textarea>
      ${!isDismissed ? `
      <div class="avviso-actions">
        <button class="btn-primary btn-dismiss-avviso" data-id="${a.id}">✓ Segna come gestito</button>
      </div>` : `<div style="font-size:11px;color:#9ca3af;margin-top:8px">Gestito il ${new Date(a.dismissedAt).toLocaleDateString('it-IT')}</div>`}
    </div>`;
  }).join('');

  $('#avvisi-grid').html(html);
}

let avvisiNotesTimers = {};

$(document).on('input', '.avviso-notes', function() {
  const id = $(this).data('id');
  clearTimeout(avvisiNotesTimers[id]);
  const val = $(this).val();
  avvisiNotesTimers[id] = setTimeout(async () => {
    await apiPut(`api/alerts/${id}/notes`, { notes: val });
  }, 800);
});

$(document).on('click', '.btn-dismiss-avviso', async function() {
  const id = $(this).data('id');
  await apiPost(`api/alerts/${id}/dismiss`, {});
  loadAvvisi();
});

// ── Planning ──────────────────────────────────────────────────
$(document).on('click', '#btn-accetta',      () => planConfirm());
$(document).on('click', '#btn-completa',     () => planAutoComplete());
$(document).on('click', '#btn-abbandona',    () => pianificaAbbandona());
$(document).on('click', '#plan-prev-week',   () => planNavigateWeek(-1));
$(document).on('click', '#plan-next-week',   () => planNavigateWeek(1));
$(document).on('click', '#plan-today-week',  () => planGoCurrentWeek());
$(document).on('input', '#plan-frequency',   () => onPlanFrequencyChange());
$(document).on('change', '#plan-structure',  () => onPlanStructureChange());

async function startPlanning(therapyId) {
  planTherapy  = allTherapies.find(t => t.id === therapyId);
  planPatient  = patientCache[currentPatientId];
  planReturnPatientId = currentPatientId;
  if (!planTherapy || !planPatient) return;

  const freqInput = $('#plan-frequency');
  if (planTherapy.type === 0)      { freqInput.attr({min:1, max:5}); }
  else if (planTherapy.type === 2) { freqInput.attr({min:1, max:2}); }
  else                             { freqInput.attr({min:1, max:3}); }
  planFrequency = 1; freqInput.val(1);
  $('#plan-frequency-val').text(1);

  planStructureId = planPatient.preferredStructureId || 1;
  $('#plan-structure').val(planStructureId);
  $('#plan-patient-pref').text(planPatient.preferenzaOrario || 'Nessuna');
  const prefStr = planPatient.preferenzaOrario ? ` — Preferenza di orario: ${planPatient.preferenzaOrario}` : '';
  $('#planning-title').text(`Pianificazione di ${planPatient.fullName} per ${THERAPY_TYPE_LABELS[planTherapy.type]}${prefStr}`);

  planSelectedSlots = []; planPreviewData = null;
  planWeekCursor = getMondayOfWeek(new Date());

  $('.section').addClass('hidden');
  $('#section-planning').removeClass('hidden');
  $('#planning-step-preview').addClass('hidden');
  updatePlanButtons();

  await loadPlanSlots();
}

function getWeekPattern() {
  if (!planSelectedSlots.length) return [];
  const firstDate = planSelectedSlots.reduce((a, b) => new Date(a.date) < new Date(b.date) ? a : b);
  const firstWeek = dateToYMD(getMondayOfWeek(new Date(firstDate.date)));
  return planSelectedSlots.filter(s => dateToYMD(getMondayOfWeek(new Date(s.date))) === firstWeek);
}

function updatePlanButtons() {
  if (!planTherapy) return;
  const isL11    = planTherapy.type === 0;
  const total    = planTherapy.duration || 0;
  const selected = planSelectedSlots.length;
  const hasAny   = selected > 0;

  if (isL11) {
    // L11: Accetta as soon as enough slots selected for the week
    const ready = selected >= planFrequency;
    $('#btn-accetta').toggleClass('hidden', !ready);
    $('#btn-completa').toggleClass('hidden', !hasAny || ready);
  } else {
    // HKT: Accetta only when preview confirms all sessions covered
    const hktDone = planPreviewData &&
                    !planPreviewData.incomplete &&
                    planPreviewData.sessionCount >= total;
    const patternSet = getWeekPattern().length >= planFrequency;
    $('#btn-accetta').toggleClass('hidden', !hktDone);
    $('#btn-completa').toggleClass('hidden', !(patternSet && !hktDone));
    if (total > 0) {
      const done = planPreviewData?.sessionCount || 0;
      $('#plan-progress').text(`${done} / ${total}`).removeClass('hidden');
    } else {
      $('#plan-progress').addClass('hidden');
    }
  }

  if (isL11) $('#plan-progress').addClass('hidden');
}

async function loadPlanSlots() {
  const weekStart = dateToYMD(planWeekCursor);
  const sex = planPatient?.sesso || '';
  const d4 = new Date(planWeekCursor.getTime() + 4*86400000);
  $('#plan-week-label').text(`${planWeekCursor.getDate()} ${MONTHS_IT[planWeekCursor.getMonth()]} – ${d4.getDate()} ${MONTHS_IT[d4.getMonth()]} ${d4.getFullYear()}`);

  planSlotsData = await apiGet(`api/planning/slots?structureId=${planStructureId}&therapyType=${planTherapy.type}&sex=${sex}&weekStart=${weekStart}`);
  renderPlanSlotGrid();
}

function renderPlanSlotGrid() {
  const grid = $('#plan-slot-grid');
  if (!planSlotsData) { grid.html(''); return; }
  const { slots, groups } = planSlotsData;
  const isGroup = planTherapy.type === 2;

  // always include group hours in the time range
  const hours = [...new Set([
    ...slots.map(s=>s.hour),
    ...groups.map(g=>parseInt(g.startTime))
  ])].sort((a,b)=>a-b);
  if (!hours.length) { grid.html('<div style="padding:32px;text-align:center;color:#9ca3af">Nessuno slot disponibile questa settimana</div>'); return; }

  let html = '<div class="plan-grid"><div class="plan-grid-corner"></div>';
  for (let di = 0; di < 5; di++) {
    const d = new Date(planWeekCursor.getTime() + di*86400000);
    const isToday = isSameDay(d, today);
    html += `<div class="plan-grid-day-header${isToday?' today':''}">${DAYS_SHORT[di]} ${d.getDate()}</div>`;
  }

  hours.forEach(hour => {
    html += `<div class="plan-grid-time">${String(hour).padStart(2,'0')}:00</div>`;
    for (let di = 1; di <= 5; di++) {
      const d    = new Date(planWeekCursor.getTime() + (di-1)*86400000);
      const date = dateToYMD(d);
      const cellSlots  = isGroup ? [] : slots.filter(s => s.dayOfWeek===di && s.hour===hour);
      const cellGroups = groups.filter(g => g.dayOfWeek===di && parseInt(g.startTime)===hour);

      let cellHtml = '';
      cellSlots.forEach(s => {
        const sel   = planSelectedSlots.some(ps => ps.date===date && ps.hour===hour && ps.therapistId===s.therapistId);
        const color = PLAN_COLORS[s.therapistColor] || '#3498db';
        const key   = `s_${di}_${hour}_${s.therapistId}`;
        planSlotRegistry[key] = { dayOfWeek:di, date, hour, therapistId:s.therapistId, therapistName:s.therapistName, therapistColor:s.therapistColor, groupId:null };
        cellHtml += `<div class="plan-slot-box${sel?' selected':''}" style="background:${color}" data-key="${key}">${s.therapistName.split(' ')[0]}</div>`;
      });
      cellGroups.forEach(g => {
        const sel        = planSelectedSlots.some(ps => ps.date===date && ps.groupId===g.id);
        const color      = PLAN_COLORS[g.therapistColor] || '#3498db';
        const selectable = g.selectable;
        const key        = `g_${di}_${hour}_${g.id}`;
        if (selectable) {
          planSlotRegistry[key] = { dayOfWeek:di, date, hour, therapistId:g.therapistId, therapistName:g.therapistName, therapistColor:g.therapistColor, groupId:g.id };
        }
        const border  = selectable ? '' : 'border:2px solid #dc2626;';
        const cursorS = selectable ? '' : 'cursor:default;opacity:0.75;';
        const noHover = selectable ? '' : ' plan-slot-no-hover';
        const label   = `Gruppo (${g.sex}) ${g.therapistName.split(' ')[0]} [${g.memberCount}/5]`;
        const dataKey = selectable ? `data-key="${key}"` : '';
        const fg2 = contrastColor(color);
        cellHtml += `<div class="plan-slot-box${sel?' selected':''}${noHover}" style="background:${color};color:${fg2};${border}${cursorS}" ${dataKey}>${label}</div>`;
      });
      html += `<div class="plan-grid-cell">${cellHtml}</div>`;
    }
  });
  html += '</div>';
  grid.html(html);

  // occupied slots not shown in planning grid - admin sees only available slots

  // auto-preview for HKT only
  const isL11now = planTherapy?.type === 0;
  if (!isL11now && getWeekPattern().length >= planFrequency && planFrequency > 0) {
    planShowPreview().then(() => updatePlanButtons());
  } else {
    if (isL11now) $('#planning-step-preview').addClass('hidden');
    updatePlanButtons();
  }
}

$(document).on('click', '.plan-slot-box', function() {
  const key  = $(this).data('key');
  const slot = planSlotRegistry[key];
  if (!slot) return;

  const currentWeekKey    = dateToYMD(getMondayOfWeek(new Date(slot.date)));
  const slotsThisWeek     = planSelectedSlots.filter(ps => dateToYMD(getMondayOfWeek(new Date(ps.date))) === currentWeekKey).length;
  const idx = planSelectedSlots.findIndex(ps => ps.date===slot.date && ps.hour===slot.hour);

  if (idx >= 0) {
    planSelectedSlots.splice(idx, 1);
  } else {
    if (slotsThisWeek >= planFrequency) return;
    if (planSelectedSlots.length > 0 && planSelectedSlots[0].therapistId !== slot.therapistId) {
      alert('Tutti gli slot devono essere dello stesso terapista'); return;
    }
    planSelectedSlots.push(slot);
  }
  renderPlanSlotGrid();
});

function onPlanFrequencyChange() {
  planFrequency = parseInt($('#plan-frequency').val());
  $('#plan-frequency-val').text(planFrequency);
  const byWeek = {};
  const kept   = [];
  planSelectedSlots.forEach(s => {
    const wk = dateToYMD(getMondayOfWeek(new Date(s.date)));
    byWeek[wk] = (byWeek[wk]||0) + 1;
    if (byWeek[wk] <= planFrequency) kept.push(s);
  });
  planSelectedSlots = kept;
  renderPlanSlotGrid();
}

async function onPlanStructureChange() {
  planStructureId   = parseInt($('#plan-structure').val());
  planSelectedSlots = [];
  await loadPlanSlots();
}

async function planNavigateWeek(dir) {
  planWeekCursor = new Date(planWeekCursor.getTime() + dir*7*86400000);
  await loadPlanSlots();
}

async function planGoCurrentWeek() {
  planWeekCursor = getMondayOfWeek(new Date());
  await loadPlanSlots();
}

async function planAutoComplete() {
  if (!planSelectedSlots.length) { alert('Seleziona prima uno slot di partenza'); return; }
  const isL11 = planTherapy?.type === 0;
  const total = planTherapy?.duration || 0;
  const base  = planSelectedSlots[0];
  const { slots, groups } = planSlotsData;
  const isGroup = planTherapy.type === 2;

  const candidates = isGroup
    ? groups.filter(g => g.therapistId===base.therapistId && parseInt(g.startTime)===base.hour)
    : slots.filter(s => s.therapistId===base.therapistId && s.hour===base.hour);

  const currentWeekKey = dateToYMD(planWeekCursor);
  for (const c of candidates) {
    const slotsThisWeek = planSelectedSlots.filter(ps => dateToYMD(getMondayOfWeek(new Date(ps.date))) === currentWeekKey).length;
    if (slotsThisWeek >= planFrequency) break;
    const d    = new Date(planWeekCursor.getTime() + (c.dayOfWeek-1)*86400000);
    const date = dateToYMD(d);
    if (planSelectedSlots.some(ps => ps.date===date && ps.hour===base.hour)) continue;
    planSelectedSlots.push({ dayOfWeek:c.dayOfWeek, date, hour:base.hour, therapistId:base.therapistId, therapistName:base.therapistName, therapistColor:base.therapistColor, groupId:isGroup?c.id:null });
  }

  if (!isL11) {
    await planShowPreview();
    const pattern    = getWeekPattern();
    let weekCursor   = new Date(planWeekCursor.getTime() + 7*86400000);
    let safety       = 0;
    while (safety++ < 200 && planPreviewData && planPreviewData.sessionCount < total) {
      pattern.forEach(p => {
        const d    = new Date(weekCursor.getTime() + (p.dayOfWeek-1)*86400000);
        const date = dateToYMD(d);
        if (!planSelectedSlots.some(ps => ps.date===date)) {
          planSelectedSlots.push({ dayOfWeek:p.dayOfWeek, date, hour:p.hour, therapistId:base.therapistId, therapistName:base.therapistName, therapistColor:base.therapistColor, groupId:base.groupId });
        }
      });
      await planShowPreview();
      weekCursor = new Date(weekCursor.getTime() + 7*86400000);
    }
  }
  renderPlanSlotGrid();
}

async function planShowPreview() {
  if (!planSelectedSlots.length) return;
  const pattern = getWeekPattern();
  if (!pattern.length) return;
  const therapistId = planSelectedSlots[0].therapistId;
  const groupId     = planSelectedSlots[0].groupId || null;

  try {
    planPreviewData = await apiPost('api/planning/preview', {
      therapyId: planTherapy.id, therapistId, groupId,
      weekPattern: pattern.map(s => ({ dayOfWeek:s.dayOfWeek, date:s.date, hour:s.hour }))
    });
    renderPlanPreview();
    $('#planning-step-preview').removeClass('hidden');
    updatePlanButtons();
  } catch {}
}

function renderPlanPreview() {
  const { slots, sessionCount, totalSessions, incomplete, isL11, endDate } = planPreviewData;
  let info = isL11
    ? `<span>Legge 11 — ${slots.length} sessioni pianificate fino al <strong>${endDate}</strong></span>`
    : `<span>${sessionCount} di ${totalSessions} sessioni pianificate</span>${incomplete ? '<span class="badge badge-suspended" style="margin-left:12px">⚠ Non tutte le sessioni sono pianificabili con questo pattern</span>' : ''}`;
  $('#plan-preview-info').html(info);

  const byWeek = {};
  slots.forEach(s => {
    const key = dateToYMD(getMondayOfWeek(new Date(s.date)));
    if (!byWeek[key]) byWeek[key] = [];
    byWeek[key].push(s);
  });

  let html = '';
  Object.keys(byWeek).sort().forEach(wk => {
    const mon = new Date(wk);
    const fri = new Date(mon.getTime() + 4*86400000);
    html += `<div class="preview-week"><div class="preview-week-label">${mon.getDate()} ${MONTHS_IT[mon.getMonth()]} – ${fri.getDate()} ${MONTHS_IT[fri.getMonth()]} ${fri.getFullYear()}</div><div class="preview-week-slots">`;
    byWeek[wk].forEach(s => {
      const d       = new Date(s.date);
      const dayName = DAYS_IT[d.getDay()-1] || '';
      const conflict = s.hasConflict ? '<span class="badge badge-suspended" style="font-size:10px">conflitto</span>' : '';
      const num = s.sessionNumber ? `<span style="color:#9ca3af;font-size:11px">#${s.sessionNumber}</span>` : '';
      html += `<div class="preview-slot-pill">${dayName} ${String(s.hour).padStart(2,'0')}:00 ${num} ${conflict}</div>`;
    });
    html += '</div></div>';
  });
  $('#plan-preview-calendar').html(html);
}

async function planConfirm() {
  if (!planTherapy || !planSelectedSlots.length) return;
  const therapistId = planSelectedSlots[0].therapistId;
  const isL11       = planTherapy.type === 0;

  if (isL11) {
    // for L11: send weekly pattern, server generates all slots
    const pattern = planSelectedSlots.map(s => ({ dayOfWeek: s.dayOfWeek, date: s.date, hour: s.hour }));
    await apiPost('api/planning/confirml11', { therapyId: planTherapy.id, therapistId, pattern });
  } else {
    // for HKT: use preview slots
    if (!planPreviewData) await planShowPreview();
    if (!planPreviewData) return;
    const groupId    = planSelectedSlots[0].groupId || null;
    const confirmSlots = planPreviewData.slots.filter(s => !s.hasConflict).map(s => ({ date:s.date, hour:s.hour }));
    await apiPost('api/planning/confirm', { therapyId:planTherapy.id, therapistId, groupId, slots:confirmSlots });
  }

  pianificaAbbandona();
}

function pianificaAbbandona() {
  currentPatientId = planReturnPatientId;
  planTherapy = null; planPatient = null;
  $('.section').addClass('hidden');
  $('#section-patient-detail').removeClass('hidden');
  apiGet(`api/patients/${currentPatientId}/therapies`).then(data => { allTherapies = data; renderTherapyList(); });
}

// ── Uso giornaliero / settimanale ────────────────────────────
function calcUsoPerHour(dateStr, hour) {
  if (!calPeriodData) return 0;
  const d   = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay() === 0 ? 7 : d.getDay();

  // individual slots
  const indSlots = (calPeriodData.plannedSlots || []).filter(ps =>
    ps.date === dateStr && ps.startHour === hour && !ps.groupId).length;

  // group members at this hour
  const dayGroups = (calPeriodData.groups || []).filter(g =>
    g.dayOfWeek === dow && g.startHour === hour);
  const groupPeople = dayGroups.reduce((acc, g) => acc + g.memberCount, 0);

  // therapists running a group or having an individual slot at this hour
  const therapistSet = new Set();
  dayGroups.forEach(g => therapistSet.add(g.therapistId));
  (calPeriodData.plannedSlots || []).filter(ps =>
    ps.date === dateStr && ps.startHour === hour).forEach(ps => therapistSet.add(ps.therapistId));

  return indSlots + groupPeople + therapistSet.size;
}

function renderUsoGiornaliero() {
  if (isWeekend(cursor)) { while (isWeekend(cursor)) cursor = new Date(cursor.getTime() + 86400000); }
  const dateStr = dateToYMD(cursor);
  const dayName = DAYS_IT[cursor.getDay() - 1];
  const label   = `${dayName}, ${cursor.getDate()} ${MONTHS_IT[cursor.getMonth()]} ${cursor.getFullYear()}`;
  $('#period-label').text(label);

  const { minHour, maxHour } = calHourRange();
  const hours = Array.from({length: maxHour - minHour}, (_, i) => i + minHour);

  let html = `<div class="uso-header">
    <button class="btn-secondary no-print" onclick="printCalendarView()">🖨 Stampa</button>
  </div>
  <table class="uso-table">
    <thead><tr><th>Ora</th><th>Persone in acqua</th></tr></thead><tbody>`;

  hours.forEach(hour => {
    const count = calcUsoPerHour(dateStr, hour);
    html += `<tr>
      <td>${String(hour).padStart(2,'0')}:00</td>
      <td class="${count > 0 ? 'uso-count' : ''}">${count || '–'}</td>
    </tr>`;
  });

  html += '</tbody></table>';
  $('#view-daily').html(html);
}

function renderUsoSettimanale() {
  let d = new Date(cursor);
  let dow = d.getDay(); if (dow === 0) dow = 7;
  d.setDate(d.getDate() - (dow - 1));
  const weekDays = [];
  for (let i = 0; i < 5; i++) { weekDays.push(new Date(d)); d = new Date(d.getTime() + 86400000); }

  const mon = weekDays[0], fri = weekDays[4];
  $('#period-label').text(`${mon.getDate()} ${MONTHS_IT[mon.getMonth()]} – ${fri.getDate()} ${MONTHS_IT[fri.getMonth()]} ${fri.getFullYear()}`);

  const { minHour, maxHour } = calHourRange();
  const hours = Array.from({length: maxHour - minHour}, (_, i) => i + minHour);

  let html = `<div class="uso-header">
    <button class="btn-secondary no-print" onclick="printCalendarView()">🖨 Stampa</button>
  </div>
  <table class="uso-table">
    <thead><tr><th>Ora</th>`;
  weekDays.forEach((day, i) => {
    const isToday = isSameDay(day, today) ? ' style="color:#3b7fd4"' : '';
    html += `<th${isToday}>${DAYS_SHORT[i]} ${day.getDate()}</th>`;
  });
  html += '</tr></thead><tbody>';

  hours.forEach(hour => {
    html += `<tr><td>${String(hour).padStart(2,'0')}:00</td>`;
    weekDays.forEach(day => {
      const count = calcUsoPerHour(dateToYMD(day), hour);
      html += `<td class="${count > 0 ? 'uso-count' : ''}">${count || '–'}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  $('#view-weekly').html(html);
}

function printCalendarView() {
  const title = $('#period-label').text();
  const tableHtml = $('.uso-table').prop('outerHTML') || $('.group-week-grid').prop('outerHTML') || '';
  const html = `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">
    <title>${title}</title>
    <style>
      @media print { .no-print { display:none!important; } }
      body { font-family:system-ui,sans-serif; padding:24px; color:#1a1a2e; }
      h2 { margin-bottom:16px; }
      table { width:100%; border-collapse:collapse; font-size:13px; }
      th { background:#f3f4f6; padding:8px 12px; text-align:left; border-bottom:2px solid #e5e7eb; }
      td { padding:8px 12px; border-bottom:1px solid #f0f0f0; text-align:center; }
      th:first-child, td:first-child { text-align:left; }
      .uso-count { font-weight:700; color:#1a1a2e; }
    </style></head><body>
    <div class="no-print" style="margin-bottom:16px">
      <button onclick="window.print()" style="padding:8px 20px;background:#3b7fd4;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer">🖨 Stampa</button>
    </div>
    <h2>${title}</h2>
    ${tableHtml}
    </body></html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

// ── Admin Convenzioni ─────────────────────────────────────────
$(document).on('click', '#btn-new-convenzione',    () => { $('#conv-name').val(''); $('#convenzione-form-container').removeClass('hidden'); });
$(document).on('click', '#btn-cancel-convenzione', () => $('#convenzione-form-container').addClass('hidden'));
$(document).on('click', '#btn-save-convenzione',   async () => {
  const name = $('#conv-name').val().trim();
  if (!name) return;
  await apiPost('api/admin/paymenttypes', { name, type:1 });
  $('#convenzione-form-container').addClass('hidden');
  loadConvenzioni();
});

async function loadConvenzioni() {
  const list = await apiGet('api/admin/paymenttypes');
  $('#convenzioni-tbody').html(list.map(pt => {
    if (pt.type === 0) return `<tr><td>${pt.name}</td><td><span class="badge" style="background:#f0f9ff;color:#0369a1">Sistema</span></td><td>–</td><td></td></tr>`;
    const activeBadge = pt.type===1 ? '<span class="badge badge-active">Attiva</span>' : '<span class="badge badge-suspended">Disabilitata</span>';
    return `<tr>
      <td><input class="conv-name-input" value="${pt.name}" data-id="${pt.id}"></td>
      <td><span class="badge" style="background:#f3f4f6;color:#374151">Assicurazione</span></td>
      <td>${activeBadge}</td>
      <td>
        <button class="btn-toggle-conv" data-id="${pt.id}" data-type="${pt.type}">${pt.type===1?'Disabilita':'Riabilita'}</button>
        <button class="btn-danger btn-del-conv" data-id="${pt.id}">Elimina</button>
      </td>
    </tr>`;
  }).join(''));
}

$(document).on('change', '.conv-name-input', async function() {
  const id = parseInt($(this).data('id')), name = $(this).val();
  const list = await apiGet('api/admin/paymenttypes');
  const pt = list.find(x => x.id === id); if (!pt) return;
  await apiPut(`api/admin/paymenttypes/${id}`, { name, type:pt.type });
});
$(document).on('click', '.btn-toggle-conv', async function() {
  const id = parseInt($(this).data('id')), cur = parseInt($(this).data('type'));
  const list = await apiGet('api/admin/paymenttypes');
  const pt = list.find(x => x.id === id); if (!pt) return;
  await apiPut(`api/admin/paymenttypes/${id}`, { name:pt.name, type:cur===1?2:1 });
  loadConvenzioni();
});
$(document).on('click', '.btn-del-conv', async function() {
  if (!confirm('Eliminare questa voce?')) return;
  await apiDelete(`api/admin/paymenttypes/${$(this).data('id')}`);
  loadConvenzioni();
});

// ── Admin Gruppi ──────────────────────────────────────────────
$(document).on('click', '#btn-new-group', async () => {
  await populateTherapistSelect('#gf-therapist');
  $('#gf-sex').val(''); $('#gf-slot-label').text('Nessuno');
  $('#gf-week-grid').addClass('hidden');
  $('#group-form-container').removeClass('hidden');
  $('#group-archive-container').addClass('hidden');
  currentGroupId = null; selectedGroupSlot = null;
  // auto-load grid if a therapist is already selected
  const tid = $('#gf-therapist').val();
  if (tid) {
    groupTherapistAvail = await apiGet(`api/admin/users/${tid}/availability`);
    renderGroupWeekGrid();
    $('#gf-week-grid').removeClass('hidden');
  }
});
$(document).on('click', '#btn-cancel-group',   () => { $('#group-form-container').addClass('hidden'); selectedGroupSlot = null; });
$(document).on('click', '#btn-cancel-archive', () => { $('#group-archive-container').addClass('hidden'); currentGroupId = null; });

$(document).on('change', '#gf-therapist', async () => {
  const tid = $('#gf-therapist').val(); if (!tid) { $('#gf-week-grid').addClass('hidden'); return; }
  groupTherapistAvail = await apiGet(`api/admin/users/${tid}/availability`);
  selectedGroupSlot   = null;
  $('#gf-slot-label').text('Nessuno');
  renderGroupWeekGrid();
  $('#gf-week-grid').removeClass('hidden');
});

function isHourAvailable(dow, hour) {
  return groupTherapistAvail.some(a => a.dayOfWeek===dow && hour>=parseInt(a.startTime) && hour<parseInt(a.endTime));
}

function renderGroupWeekGrid() {
  let minHour = 8, maxHour = 17;
  if (groupTherapistAvail.length) {
    minHour = Math.min(...groupTherapistAvail.map(a => parseInt(a.startTime)));
    maxHour = Math.max(...groupTherapistAvail.map(a => parseInt(a.endTime)));
  }
  const gridHours = Array.from({length: maxHour-minHour}, (_, i) => i+minHour);

  let headerHtml = '<div class="gwg-header-corner"></div>';
  DAY_NAMES_FULL.forEach(n => headerHtml += `<div class="gwg-header-cell">${n.substring(0,3)}</div>`);

  let rowsHtml = '';
  gridHours.forEach(hour => {
    rowsHtml += `<div class="gwg-row"><div class="gwg-time">${String(hour).padStart(2,'0')}:00</div>`;
    for (let di = 1; di <= 5; di++) {
      const avail    = isHourAvailable(di, hour);
      const selected = selectedGroupSlot && selectedGroupSlot.dayOfWeek===di && selectedGroupSlot.hour===hour;
      const cls      = selected ? 'selected' : (avail ? 'avail' : 'unavail');
      rowsHtml += `<div class="gwg-cell ${cls}"${avail?` data-di="${di}" data-hour="${hour}"`:''}></div>`;
    }
    rowsHtml += '</div>';
  });

  $('#gf-week-grid').html(`<div class="gwg-header">${headerHtml}</div>${rowsHtml}`);
}

$(document).on('click', '.gwg-cell.avail', function() {
  const di = parseInt($(this).data('di')), hour = parseInt($(this).data('hour'));
  selectedGroupSlot = { dayOfWeek:di, hour };
  $('#gf-slot-label').text(`${DAY_NAMES_FULL[di-1]} ${String(hour).padStart(2,'0')}:00`);
  renderGroupWeekGrid();
});

$(document).on('click', '#btn-save-group', async () => {
  const tid = $('#gf-therapist').val(), sex = $('#gf-sex').val();
  if (!tid)               { alert('Seleziona un terapista'); return; }
  if (!sex)               { alert('Seleziona il sesso'); return; }
  if (!selectedGroupSlot) { alert('Seleziona uno slot nel calendario'); return; }
  try {
    await apiPost('api/groups', { therapistId:parseInt(tid), sex, dayOfWeek:selectedGroupSlot.dayOfWeek, startTime:`${String(selectedGroupSlot.hour).padStart(2,'0')}:00`, endDate:null });
    $('#group-form-container').addClass('hidden');
    loadGroups();
  } catch (xhr) { alert(xhr.responseJSON?.error || 'Errore'); }
});

async function loadGroups() {
  if (allTherapists.length === 0) await loadTherapists();
  populateTherapistSelect('#cal-therapist-select');
  const list = await apiGet('api/groups');
  $('#groups-tbody').html(list.map(g => {
    const day    = DAY_NAMES_FULL[g.dayOfWeek-1] || '–';
    const sex    = g.sex==='M' ? 'Uomo' : g.sex==='F' ? 'Donna' : 'Misto';
    const status = g.isArchived ? '<span class="badge badge-suspended">Archiviato</span>' : '<span class="badge badge-active">Attivo</span>';
    const archBtn = `<button class="btn-archive-group" data-id="${g.id}" data-end="${g.endDate?g.endDate.substring(0,10):''}">Archivia</button>`;
    const delBtn  = g.hasSlots ? '' : `<button class="btn-danger btn-del-group" data-id="${g.id}">Elimina</button>`;
    return `<tr><td>${g.therapistName}</td><td>${day}</td><td>${g.startTime}</td><td>${sex}</td><td>${status}</td><td>${archBtn}${delBtn}</td></tr>`;
  }).join(''));
}

$(document).on('click', '.btn-archive-group', function() {
  currentGroupId = parseInt($(this).data('id'));
  $('#ga-enddate').val($(this).data('end') || '');
  $('#group-archive-container').removeClass('hidden');
  $('#group-form-container').addClass('hidden');
});
$(document).on('click', '#btn-save-archive', async () => {
  await apiPut(`api/groups/${currentGroupId}/archive`, { endDate:$('#ga-enddate').val() || null });
  $('#group-archive-container').addClass('hidden');
  loadGroups();
});
$(document).on('click', '.btn-del-group', async function() {
  if (!confirm('Eliminare questo gruppo?')) return;
  try { await apiDelete(`api/groups/${$(this).data('id')}`); loadGroups(); }
  catch (xhr) { alert(xhr.responseJSON?.error || 'Errore'); }
});

// ── Prime Disponibilità ──────────────────────────────────────
async function loadDisponibilita() {
  const list = await apiGet(`api/calendar/availability?structureId=${calStructureId}`);
  if (!list.length) {
    $('#disponibilita-list').html('<div style="padding:32px;text-align:center;color:#9ca3af">Nessuna disponibilità trovata</div>');
    return;
  }

  const html = list.map(th => {
    const color = COLORS[th.therapistColor] || '#3498db';
    const fg    = contrastColor(color);

    const slotsHtml = (th.slots || []).map(s => {
      const d   = new Date(s.date + 'T00:00:00');
      const day = DAYS_IT[d.getDay() - 1] || '';
      const dt  = d.toLocaleDateString('it-IT');
      const hr  = String(s.hour).padStart(2,'0') + ':00';
      return `<div class="dispon-slot">📅 ${day} ${dt} — ${hr}</div>`;
    }).join('');

    const formatGroup = (g, sex) => {
      if (!g) return `<div class="dispon-slot dispon-slot-nogroup">Gruppo ${sex}: nessuno disponibile</div>`;
      const d   = new Date(g.date + 'T00:00:00');
      const day = DAYS_IT[d.getDay() - 1] || '';
      const dt  = d.toLocaleDateString('it-IT');
      const hr  = String(g.hour).padStart(2,'0') + ':00';
      return `<div class="dispon-slot dispon-slot-group">👥 Gruppo ${sex}: ${day} ${dt} — ${hr} (${g.memberCount}/5)</div>`;
    };

    const groupM = formatGroup(th.firstGroupM, 'M');
    const groupF = formatGroup(th.firstGroupF, 'F');

    if (!th.slots.length && !th.firstGroupM && !th.firstGroupF) return '';

    return `<div class="dispon-therapist">
      <div class="dispon-name" style="background:${color};color:${fg}">${th.therapistName}</div>
      <div class="dispon-slots">
        ${slotsHtml}
        <div style="margin-top:6px;padding-top:6px;border-top:1px solid #e0e3ea">
          ${groupM}${groupF}
        </div>
      </div>
    </div>`;
  }).join('');

  $('#disponibilita-list').html(`<div class="dispon-grid">${html || '<div style="padding:32px;text-align:center;color:#9ca3af">Nessuna disponibilità trovata</div>'}</div>`);
}

// ── Admin Ferie/Assenze ───────────────────────────────────────
$(document).on('click', '#btn-new-vacation', async () => {
  await populateTherapistSelect('#vf-therapist');
  if (!$('#vf-therapist option[value=""]').length) $('#vf-therapist').prepend('<option value="">— Pubblica —</option>');
  $('#vf-name').val(''); $('#vf-day').val(1); $('#vf-month').val(1); $('#vf-start, #vf-end').val('');
  $('#vf-preview-container').addClass('hidden');
  $('#vacation-form-container').removeClass('hidden');
  onVacationTypeChange();
});
$(document).on('click', '#btn-cancel-vacation', () => $('#vacation-form-container').addClass('hidden'));
$(document).on('change', 'input[name="vf-type"]', onVacationTypeChange);

function onVacationTypeChange() {
  const type = $('input[name="vf-type"]:checked').val();
  $('#vf-fixed-fields').toggleClass('hidden', type!=='fixed');
  $('#vf-dated-fields').toggleClass('hidden', type!=='dated');
}

function buildVacationRequest() {
  const type = $('input[name="vf-type"]:checked').val();
  const tid  = $('#vf-therapist').val();
  return {
    name:              $('#vf-name').val().trim(),
    therapistId:       tid ? parseInt(tid) : null,
    isYearIndependent: type==='fixed',
    month:             type==='fixed' ? parseInt($('#vf-month').val()) : null,
    day:               type==='fixed' ? parseInt($('#vf-day').val())   : null,
    startDate:         type==='dated' ? $('#vf-start').val() || null   : null,
    endDate:           type==='dated' ? $('#vf-end').val()   || null   : null
  };
}

$(document).on('click', '#btn-preview-vacation', async () => {
  const req = buildVacationRequest();
  if (!req.name) { alert('Inserire un nome'); return; }
  const data = await apiPost('api/vacations/preview', req);
  const list = data.movedSlots;
  if (!list.length) { $('#vf-preview-list').html('<span style="color:#15803d">Nessuno slot interessato.</span>'); }
  else {
    $('#vf-preview-list').html(list.map(s => {
      const orig = new Date(s.originalDate).toLocaleDateString('it-IT');
      if (s.action==='removed') return `<div style="margin-bottom:6px">🗑 <strong>${s.patientName}</strong> (${s.therapistName}) — ${orig} → <span style="color:#b91c1c">eliminato (L11)</span></div>`;
      if (s.action==='moved' && s.newDate) return `<div style="margin-bottom:6px">↪ <strong>${s.patientName}</strong> (${s.therapistName}) — ${orig} → ${new Date(s.newDate).toLocaleDateString('it-IT')}</div>`;
      return `<div style="margin-bottom:6px">⚠ <strong>${s.patientName}</strong> (${s.therapistName}) — ${orig} → <span style="color:#b91c1c">non risolvibile</span></div>`;
    }).join(''));
  }
  $('#vf-preview-container').removeClass('hidden');
});

$(document).on('click', '#btn-save-vacation', async () => {
  const req = buildVacationRequest();
  if (!req.name) { alert('Inserire un nome'); return; }
  await apiPost('api/vacations', req);
  $('#vacation-form-container').addClass('hidden');
  loadVacations();
});

async function loadVacations() {
  const list = await apiGet('api/vacations');
  $('#vacations-tbody').html(list.map(v => {
    const therapist = v.therapistName || '<span style="color:#6b7280">Pubblica</span>';
    const type = v.isYearIndependent ? '<span class="badge" style="background:#f0f9ff;color:#0369a1">Fissa annuale</span>' : '<span class="badge" style="background:#f3f4f6;color:#374151">Data specifica</span>';
    let date = '–';
    if (v.isYearIndependent && v.month && v.day) date = `${v.day} ${MONTHS_IT_FULL[v.month-1]}`;
    else if (v.startDate) date = v.startDate===v.endDate ? new Date(v.startDate).toLocaleDateString('it-IT') : `${new Date(v.startDate).toLocaleDateString('it-IT')} – ${new Date(v.endDate).toLocaleDateString('it-IT')}`;
    return `<tr><td>${v.name}</td><td>${therapist}</td><td>${type}</td><td>${date}</td><td><button class="btn-danger btn-del-vacation" data-id="${v.id}">Elimina</button></td></tr>`;
  }).join(''));
}

$(document).on('click', '.btn-del-vacation', async function() {
  if (!confirm('Eliminare questa voce?')) return;
  await apiDelete(`api/vacations/${$(this).data('id')}`);
  loadVacations();
});
