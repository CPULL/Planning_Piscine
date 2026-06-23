using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PlanningPiscine.Data;
using PlanningPiscine.Models;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace PlanningPiscine.Controllers;

[Route("")]
public class AppController : ControllerBase {
  private readonly AppDbContext _db;

  public AppController(AppDbContext db) {
    _db = db;
  }

  // ── Helpers ──────────────────────────────────────────────

  private static string HashPassword(string password) {
    var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(password));
    return Convert.ToHexString(bytes).ToLower();
  }

  private bool IsAdmin() {
    var rolesClaim = User.FindFirstValue("Roles");
    if (int.TryParse(rolesClaim, out int roles))
      return (roles & UserRoles.Admin) != 0;
    return false;
  }

  private int CurrentUserId() =>
    int.Parse(User.FindFirstValue("UserId")!);

  // ── Auth ─────────────────────────────────────────────────

  [AllowAnonymous]
  [HttpPost("api/login")]
  public async Task<IActionResult> Login([FromBody] LoginRequest req) {
    var hash = HashPassword(req.Password);
    var user = await _db.Users.FirstOrDefaultAsync(
      u => u.LoginName == req.LoginName && u.PasswordHash == hash && !u.IsSuspended);

    if (user == null)
      return Unauthorized(new { error = "Nome utente e/o password non validi" });

    var claims = new List<Claim> {
      new Claim("UserId",    user.Id.ToString()),
      new Claim("LoginName", user.LoginName),
      new Claim("FullName",  user.FullName),
      new Claim("Roles",     user.Roles.ToString()),
      new Claim("Color",     user.Color.ToString())
    };

    var identity  = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
    var principal = new ClaimsPrincipal(identity);
    await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal);

    return Ok(new {
      user.Id,
      user.LoginName,
      user.FullName,
      user.Roles,
      user.Color
    });
  }

  [Authorize]
  [HttpPost("api/logout")]
  public async Task<IActionResult> Logout() {
    await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Ok();
  }

  [Authorize]
  [HttpGet("api/me")]
  public IActionResult Me() {
    return Ok(new {
      Id        = User.FindFirstValue("UserId"),
      LoginName = User.FindFirstValue("LoginName"),
      FullName  = User.FindFirstValue("FullName"),
      Roles     = User.FindFirstValue("Roles"),
      Color     = User.FindFirstValue("Color")
    });
  }

  // ── Admin: Users ─────────────────────────────────────────

  [Authorize]
  [HttpGet("api/admin/users")]
  public async Task<IActionResult> GetUsers() {
    if (!IsAdmin()) return Forbid();
    var users = await _db.Users
      .OrderBy(u => u.FullName)
      .Select(u => new {
        u.Id, u.LoginName, u.FullName, u.Email,
        u.Phone, u.Color, u.Roles, u.IsSuspended, u.StructureId
      })
      .ToListAsync();
    return Ok(users);
  }

  [Authorize]
  [HttpPost("api/admin/users")]
  public async Task<IActionResult> CreateUser([FromBody] UserRequest req) {
    if (!IsAdmin()) return Forbid();

    var user = new User {
      LoginName   = req.LoginName,
      FullName    = req.FullName,
      Email       = req.Email,
      Phone       = req.Phone,
      PasswordHash = HashPassword(req.Password),
      Color       = req.Color,
      Roles       = req.Roles,
      StructureId = req.StructureId ?? 1,
      IsSuspended = false
    };

    _db.Users.Add(user);
    await _db.SaveChangesAsync();
    return Ok(new { user.Id });
  }

  [Authorize]
  [HttpPut("api/admin/users/{id}")]
  public async Task<IActionResult> UpdateUser(int id, [FromBody] UserRequest req) {
    if (!IsAdmin()) return Forbid();
    var user = await _db.Users.FindAsync(id);
    if (user == null) return NotFound();

    user.LoginName   = req.LoginName;
    user.FullName    = req.FullName;
    user.Email       = req.Email;
    user.Phone       = req.Phone;
    user.Color       = req.Color;
    user.Roles       = req.Roles;
    user.StructureId = req.StructureId ?? 1;

    if (!string.IsNullOrEmpty(req.Password))
      user.PasswordHash = HashPassword(req.Password);

    await _db.SaveChangesAsync();
    return Ok();
  }

  [Authorize]
  [HttpPost("api/admin/users/{id}/suspend")]
  public async Task<IActionResult> SuspendUser(int id) {
    if (!IsAdmin()) return Forbid();
    var user = await _db.Users.FindAsync(id);
    if (user == null) return NotFound();

    var suffix = DateTime.Now.ToString("yyyyMMdd");
    user.LoginName   = $"{user.LoginName}_{suffix}";
    user.IsSuspended = true;

    await _db.SaveChangesAsync();
    return Ok();
  }

  // ── Account: Change Password ──────────────────────────────

  [Authorize]
  [HttpPost("api/account/password")]
  public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest req) {
    var user = await _db.Users.FindAsync(CurrentUserId());
    if (user == null) return NotFound();

    if (user.PasswordHash != HashPassword(req.CurrentPassword))
      return BadRequest(new { error = "La password attuale non è corretta" });

    user.PasswordHash = HashPassword(req.NewPassword);
    await _db.SaveChangesAsync();
    return Ok();
  }

  // ── Patients ──────────────────────────────────────────────

  [Authorize]
  [HttpGet("api/patients")]
  public async Task<IActionResult> GetPatients(
    [FromQuery] string? search,
    [FromQuery] string? sortBy,
    [FromQuery] string? sortDir,
    [FromQuery] int page = 1) {

    var query = _db.Patients.AsQueryable();

    if (!string.IsNullOrWhiteSpace(search)) {
      var s = search.ToLower();
      query = query.Where(p =>
        p.FullName.ToLower().Contains(s) ||
        p.Telefono.Contains(s) ||
        p.CodiceFiscale.ToLower().Contains(s));
    }

    query = (sortBy, sortDir) switch {
      ("name",       "desc") => query.OrderByDescending(p => p.FullName),
      ("name",       _)      => query.OrderBy(p => p.FullName),
      ("data",       "desc") => query.OrderByDescending(p => p.DataInserimento),
      ("data",       _)      => query.OrderBy(p => p.DataInserimento),
      ("preferenza", "desc") => query.OrderByDescending(p => p.PreferenzaOrario),
      ("preferenza", _)      => query.OrderBy(p => p.PreferenzaOrario),
      _                      => query.OrderBy(p => p.FullName)
    };

    const int pageSize = 20;
    var total = await query.CountAsync();
    var items = await query
      .Skip((page - 1) * pageSize)
      .Take(pageSize)
      .ToListAsync();

    return Ok(new { total, page, pageSize, items });
  }

  [Authorize]
  [HttpGet("api/patients/{id}")]
  public async Task<IActionResult> GetPatient(int id) {
    var p = await _db.Patients.FindAsync(id);
    if (p == null) return NotFound();
    return Ok(p);
  }

  [Authorize]
  [HttpPost("api/patients")]
  public async Task<IActionResult> CreatePatient([FromBody] PatientRequest req) {
    var patient = new Patient {
      FullName             = req.FullName,
      CodiceFiscale        = req.CodiceFiscale.ToUpper(),
      Sesso                = req.Sesso,
      Telefono             = req.Telefono,
      PreferenzaOrario     = req.PreferenzaOrario,
      InGruppo             = req.InGruppo,
      PreferredStructureId = req.PreferredStructureId,
      DataInserimento      = DateTime.Now
    };

    _db.Patients.Add(patient);
    await _db.SaveChangesAsync();
    return Ok(new { patient.Id });
  }

  [Authorize]
  [HttpPut("api/patients/{id}")]
  public async Task<IActionResult> UpdatePatient(int id, [FromBody] PatientRequest req) {
    var patient = await _db.Patients.FindAsync(id);
    if (patient == null) return NotFound();

    patient.FullName             = req.FullName;
    patient.CodiceFiscale        = req.CodiceFiscale.ToUpper();
    patient.Sesso                = req.Sesso;
    patient.Telefono             = req.Telefono;
    patient.PreferenzaOrario     = req.PreferenzaOrario;
    patient.InGruppo             = req.InGruppo;
    patient.PreferredStructureId = req.PreferredStructureId;

    await _db.SaveChangesAsync();
    return Ok();
  }

  [Authorize]
  [HttpDelete("api/patients/{id}")]
  public async Task<IActionResult> DeletePatient(int id) {
    var patient = await _db.Patients.FindAsync(id);
    if (patient == null) return NotFound();

    _db.Patients.Remove(patient);
    await _db.SaveChangesAsync();
    return Ok();
  }

  // ── Payment Types ────────────────────────────────────────

  [Authorize]
  [HttpGet("api/admin/paymenttypes")]
  public async Task<IActionResult> GetPaymentTypes() {
    if (!IsAdmin()) return Forbid();
    var list = await _db.PaymentTypes.OrderBy(p => p.Id).ToListAsync();
    return Ok(list);
  }

  [Authorize]
  [HttpGet("api/paymenttypes/active")]
  public async Task<IActionResult> GetActivePaymentTypes() {
    var list = await _db.PaymentTypes
      .Where(p => p.Type == 0 || p.Type == 1)
      .OrderBy(p => p.Type)
      .ThenBy(p => p.Name)
      .ToListAsync();
    return Ok(list);
  }

  [Authorize]
  [HttpPost("api/admin/paymenttypes")]
  public async Task<IActionResult> CreatePaymentType([FromBody] PaymentTypeRequest req) {
    if (!IsAdmin()) return Forbid();
    var pt = new PaymentType { Name = req.Name, Type = 1 };
    _db.PaymentTypes.Add(pt);
    await _db.SaveChangesAsync();
    return Ok(new { pt.Id });
  }

  [Authorize]
  [HttpPut("api/admin/paymenttypes/{id}")]
  public async Task<IActionResult> UpdatePaymentType(int id, [FromBody] PaymentTypeRequest req) {
    if (!IsAdmin()) return Forbid();
    var pt = await _db.PaymentTypes.FindAsync(id);
    if (pt == null) return NotFound();
    if (pt.Type == 0) return BadRequest(new { error = "Le voci di sistema non possono essere modificate" });
    pt.Name = req.Name;
    pt.Type = req.Type;
    await _db.SaveChangesAsync();
    return Ok();
  }

  [Authorize]
  [HttpDelete("api/admin/paymenttypes/{id}")]
  public async Task<IActionResult> DeletePaymentType(int id) {
    if (!IsAdmin()) return Forbid();
    var pt = await _db.PaymentTypes.FindAsync(id);
    if (pt == null) return NotFound();
    if (pt.Type == 0) return BadRequest(new { error = "Le voci di sistema non possono essere eliminate" });
    _db.PaymentTypes.Remove(pt);
    await _db.SaveChangesAsync();
    return Ok();
  }

  // ── Therapies ─────────────────────────────────────────────

  [Authorize]
  [HttpGet("api/patients/{patientId}/therapies")]
  public async Task<IActionResult> GetTherapies(int patientId) {
    var therapies = await _db.Therapies
      .Where(t => t.PatientId == patientId)
      .Include(t => t.PaymentType)
      .OrderByDescending(t => t.Id)
      .Select(t => new {
        t.Id,
        t.PatientId,
        t.Type,
        t.PaymentTypeId,
        PaymentTypeName = t.PaymentType!.Name,
        t.Duration,
        t.Notes,
        t.APacchetto,
        t.Status,
        t.PrescriptionPdfId,
        t.CreatedAt
      })
      .ToListAsync();
    return Ok(therapies);
  }

  [Authorize]
  [HttpPost("api/patients/{patientId}/therapies")]
  public async Task<IActionResult> CreateTherapy(int patientId, [FromBody] TherapyRequest req) {
    if (!IsAdmin()) return Forbid();

    var therapy = new Therapy {
      PatientId     = patientId,
      Type          = req.Type,
      PaymentTypeId = req.PaymentTypeId,
      Duration      = req.Duration,
      APacchetto    = req.Type != TherapyType.Legge11 && req.APacchetto,
      Notes         = req.Notes,
      Status        = req.Status,
      CreatedAt     = DateTime.Now
    };

    _db.Therapies.Add(therapy);
    await _db.SaveChangesAsync();
    return Ok(new { therapy.Id });
  }

  [Authorize]
  [HttpPut("api/patients/{patientId}/therapies/{id}")]
  public async Task<IActionResult> UpdateTherapy(int patientId, int id, [FromBody] TherapyRequest req) {
    if (!IsAdmin()) return Forbid();
    var therapy = await _db.Therapies.FirstOrDefaultAsync(t => t.Id == id && t.PatientId == patientId);
    if (therapy == null) return NotFound();

    therapy.Type          = req.Type;
    therapy.PaymentTypeId = req.PaymentTypeId;
    therapy.Duration      = req.Duration;
    therapy.APacchetto    = req.Type != TherapyType.Legge11 && req.APacchetto;
    therapy.Notes         = req.Notes;
    therapy.Status        = req.Status;

    await _db.SaveChangesAsync();
    return Ok();
  }

  [Authorize]
  [HttpDelete("api/patients/{patientId}/therapies/{id}")]
  public async Task<IActionResult> DeleteTherapy(int patientId, int id) {
    if (!IsAdmin()) return Forbid();
    var therapy = await _db.Therapies.FirstOrDefaultAsync(t => t.Id == id && t.PatientId == patientId);
    if (therapy == null) return NotFound();
    _db.Therapies.Remove(therapy);
    await _db.SaveChangesAsync();
    return Ok();
  }

  // ── Lista di Attesa ──────────────────────────────────────

  [Authorize]
  [HttpGet("api/waitinglist")]
  public async Task<IActionResult> GetWaitingList(
    [FromQuery] int?    type,
    [FromQuery] int?    struttura,
    [FromQuery] bool?   inGruppo,
    [FromQuery] string? preferenza) {

    if (!IsAdmin()) return Forbid();

    var query = _db.Therapies
      .Where(t => t.Status == TherapyStatus.ToBeStarted)
      .Include(t => t.Patient)
      .Include(t => t.PaymentType)
      .AsQueryable();

    if (type.HasValue)
      query = query.Where(t => (int)t.Type == type.Value);

    if (struttura.HasValue)
      query = query.Where(t =>
        t.Patient!.PreferredStructureId == null ||
        t.Patient.PreferredStructureId == struttura.Value);

    if (inGruppo.HasValue)
      query = query.Where(t => t.Patient!.InGruppo == inGruppo.Value);

    if (!string.IsNullOrWhiteSpace(preferenza)) {
      var p = preferenza.ToLower();
      query = query.Where(t => t.Patient!.PreferenzaOrario.ToLower().Contains(p));
    }

    var list = await query
      .OrderBy(t => t.CreatedAt)
      .Select(t => new {
        t.Id,
        t.PatientId,
        PatientName               = t.Patient!.FullName,
        PatientPhone              = t.Patient.Telefono,
        PatientInGruppo           = t.Patient.InGruppo,
        PatientPreferenza         = t.Patient.PreferenzaOrario,
        PatientPreferredStructureId = t.Patient.PreferredStructureId,
        t.Type,
        PaymentTypeName  = t.PaymentType!.Name,
        t.Duration,
        t.CreatedAt
      })
      .ToListAsync();

    return Ok(list);
  }

  // ── Prescription PDF ──────────────────────────────────────

  [Authorize]
  [HttpPost("api/patients/{patientId}/therapies/{id}/prescription")]
  public async Task<IActionResult> UploadPrescription(int patientId, int id) {
    if (!IsAdmin()) return Forbid();
    var therapy = await _db.Therapies.FirstOrDefaultAsync(t => t.Id == id && t.PatientId == patientId);
    if (therapy == null) return NotFound();

    var file = Request.Form.Files.FirstOrDefault();
    if (file == null) return BadRequest(new { error = "Nessun file ricevuto" });

    using var ms = new MemoryStream();
    await file.CopyToAsync(ms);

    // remove old pdf if exists
    if (therapy.PrescriptionPdfId.HasValue) {
      var old = await _db.PrescriptionPdfs.FindAsync(therapy.PrescriptionPdfId.Value);
      if (old != null) _db.PrescriptionPdfs.Remove(old);
    }

    var pdf = new PrescriptionPdf {
      FileName    = file.FileName,
      ContentType = file.ContentType,
      Data        = ms.ToArray()
    };

    _db.PrescriptionPdfs.Add(pdf);
    await _db.SaveChangesAsync();

    therapy.PrescriptionPdfId = pdf.Id;
    await _db.SaveChangesAsync();

    return Ok(new { pdf.Id, pdf.FileName });
  }

  [Authorize]
  [HttpGet("api/prescriptions/{id}")]
  public async Task<IActionResult> DownloadPrescription(int id) {
    var pdf = await _db.PrescriptionPdfs.FindAsync(id);
    if (pdf == null) return NotFound();
    return File(pdf.Data, pdf.ContentType, pdf.FileName);
  }

  [Authorize]
  [HttpDelete("api/patients/{patientId}/therapies/{id}/prescription")]
  public async Task<IActionResult> DeletePrescription(int patientId, int id) {
    if (!IsAdmin()) return Forbid();
    var therapy = await _db.Therapies.FirstOrDefaultAsync(t => t.Id == id && t.PatientId == patientId);
    if (therapy == null || !therapy.PrescriptionPdfId.HasValue) return NotFound();

    var pdf = await _db.PrescriptionPdfs.FindAsync(therapy.PrescriptionPdfId.Value);
    if (pdf != null) _db.PrescriptionPdfs.Remove(pdf);

    therapy.PrescriptionPdfId = null;
    await _db.SaveChangesAsync();
    return Ok();
  }

  // ── Structures ───────────────────────────────────────────

  [Authorize]
  [HttpGet("api/structures")]
  public async Task<IActionResult> GetStructures() {
    var list = await _db.Structures.OrderBy(s => s.Name).ToListAsync();
    return Ok(list);
  }

  // ── Groups ────────────────────────────────────────────────

  [Authorize]
  [HttpGet("api/groups")]
  public async Task<IActionResult> GetGroups([FromQuery] int? therapistId) {
    if (!IsAdmin()) return Forbid();
    var query = _db.Groups
      .Include(g => g.Therapist)
      .AsQueryable();

    if (therapistId.HasValue)
      query = query.Where(g => g.TherapistId == therapistId.Value);

    var list = await query
      .OrderBy(g => g.DayOfWeek)
      .ThenBy(g => g.StartTime)
      .Select(g => new {
        g.Id,
        g.TherapistId,
        TherapistName = g.Therapist!.FullName,
        g.DayOfWeek,
        StartTime     = g.StartTime.ToString("HH:mm"),
        g.Sex,
        g.EndDate,
        IsArchived    = g.EndDate.HasValue && g.EndDate.Value <= DateTime.Now,
        HasSlots      = _db.PlannedSlots.Any(ps => ps.GroupId == g.Id)
      })
      .ToListAsync();
    return Ok(list);
  }

  [Authorize]
  [HttpGet("api/groups/calendar")]
  public async Task<IActionResult> GetGroupsForCalendar([FromQuery] int therapistId) {
    var groups = await _db.Groups
      .Where(g => g.TherapistId == therapistId &&
                  (!g.EndDate.HasValue || g.EndDate.Value > DateTime.Now))
      .Include(g => g.Therapist)
      .Select(g => new {
        g.Id,
        g.TherapistId,
        TherapistName = g.Therapist!.FullName,
        g.DayOfWeek,
        StartTime     = g.StartTime.ToString("HH:mm"),
        g.Sex,
        g.EndDate
      })
      .ToListAsync();
    return Ok(groups);
  }

  [Authorize]
  [HttpPost("api/groups")]
  public async Task<IActionResult> CreateGroup([FromBody] GroupRequest req) {
    if (!IsAdmin()) return Forbid();
    if (!TimeOnly.TryParse(req.StartTime, out var startTime))
      return BadRequest(new { error = "Orario non valido" });

    // check therapist conflict
    var conflict = await _db.Groups.AnyAsync(g =>
      g.TherapistId == req.TherapistId &&
      g.DayOfWeek   == req.DayOfWeek   &&
      g.StartTime   == startTime        &&
      (!g.EndDate.HasValue || g.EndDate.Value > DateTime.Now));

    if (conflict)
      return BadRequest(new { error = "Il terapista ha già un gruppo in questo slot" });

    var group = new Group {
      TherapistId = req.TherapistId,
      DayOfWeek   = req.DayOfWeek,
      StartTime   = startTime,
      Sex         = req.Sex,
      EndDate     = req.EndDate
    };

    _db.Groups.Add(group);
    await _db.SaveChangesAsync();
    return Ok(new { group.Id });
  }

  [Authorize]
  [HttpPut("api/groups/{id}/archive")]
  public async Task<IActionResult> ArchiveGroup(int id, [FromBody] ArchiveGroupRequest req) {
    if (!IsAdmin()) return Forbid();
    var group = await _db.Groups.FindAsync(id);
    if (group == null) return NotFound();
    group.EndDate = req.EndDate;
    await _db.SaveChangesAsync();
    return Ok();
  }

  [Authorize]
  [HttpDelete("api/groups/{id}")]
  public async Task<IActionResult> DeleteGroup(int id) {
    if (!IsAdmin()) return Forbid();
    var group = await _db.Groups.FindAsync(id);
    if (group == null) return NotFound();
    var hasSlots = await _db.PlannedSlots.AnyAsync(ps => ps.GroupId == id);
    if (hasSlots) return BadRequest(new { error = "Il gruppo ha slot pianificati e non può essere eliminato" });
    _db.Groups.Remove(group);
    await _db.SaveChangesAsync();
    return Ok();
  }

	// ── Alerts ───────────────────────────────────────────────────

	[Authorize]
	[HttpGet("api/alerts")]
	public async Task<IActionResult> GetAlerts([FromQuery] bool dismissed = false) {
		if (!IsAdmin()) return Forbid();

		var alerts = await _db.Alerts
			.Include(a => a.Patient)
			.Include(a => a.User)
			.Include(a => a.Therapy).ThenInclude(t => t!.PaymentType)
			.Where(a => dismissed ? a.DismissedAt.HasValue : !a.DismissedAt.HasValue)
			.OrderByDescending(a => a.CreatedAt)
			.ToListAsync();

		var result = alerts.Select(a => new {
			a.Id,
			a.Notes,
			a.CreatedAt,
			a.DismissedAt,
			LastSlot = a.LastSlot.ToString("yyyy-MM-dd"),
			PatientName = a.Patient?.FullName ?? "<Paziente cancellato>",
			PatientPhone = a.Patient?.Telefono ?? "",
			TherapistName = a.User?.FullName ?? "<Terapista cancellato>",
			StructureName = a.User != null ? (a.User.StructureId == 1 ? "Ponti Rossi" : a.User.StructureId == 2 ? "Porcellane" : "–") : "–",
			TherapyType = a.Therapy != null ? (int?)a.Therapy.Type : null,
			PaymentTypeName = a.Therapy?.PaymentType?.Name ?? "<Terapia cancellata>",
			APacchetto = a.Therapy != null ? (bool?)a.Therapy.APacchetto : null
		});

		return Ok(result);
	}

	[Authorize]
  [HttpPost("api/alerts/{id}/dismiss")]
  public async Task<IActionResult> DismissAlert(int id) {
    if (!IsAdmin()) return Forbid();
    var alert = await _db.Alerts.FindAsync(id);
    if (alert == null) return NotFound();
    alert.DismissedAt = DateTime.Now;
    await _db.SaveChangesAsync();
    return Ok();
  }

  [Authorize]
  [HttpPut("api/alerts/{id}/notes")]
  public async Task<IActionResult> UpdateAlertNotes(int id, [FromBody] AlertNotesRequest req) {
    if (!IsAdmin()) return Forbid();
    var alert = await _db.Alerts.FindAsync(id);
    if (alert == null) return NotFound();
    alert.Notes = req.Notes;
    await _db.SaveChangesAsync();
    return Ok();
  }

  // ── Vacations ────────────────────────────────────────────

  [Authorize]
  [HttpGet("api/vacations")]
  public async Task<IActionResult> GetVacations() {
    if (!IsAdmin()) return Forbid();
    var list = await _db.Vacations
      .Include(v => v.Therapist)
      .OrderBy(v => v.TherapistId == null ? 0 : 1)
      .ThenBy(v => v.Name)
      .Select(v => new {
        v.Id, v.Name, v.TherapistId,
        TherapistName      = v.Therapist != null ? v.Therapist.FullName : null,
        v.IsYearIndependent,
        v.Month, v.Day,
        StartDate = v.StartDate.HasValue ? v.StartDate.Value.ToString("yyyy-MM-dd") : null,
        EndDate   = v.EndDate.HasValue   ? v.EndDate.Value.ToString("yyyy-MM-dd")   : null
      })
      .ToListAsync();
    return Ok(list);
  }

  [Authorize]
  [HttpPost("api/vacations/preview")]
  public async Task<IActionResult> PreviewVacation([FromBody] VacationRequest req) {
    if (!IsAdmin()) return Forbid();

    var affectedDates = GetVacationDates(req);
    if (affectedDates.Count == 0) return Ok(new { movedSlots = new List<object>() });

    // find all planned slots on affected dates
    var affectedDatesDt = affectedDates.Select(d => d.ToDateTime(TimeOnly.MinValue).Date).ToList();

    var query = _db.PlannedSlots
      .Include(ps => ps.Therapy)
        .ThenInclude(t => t!.Patient)
      .Include(ps => ps.Therapist)
      .Where(ps => affectedDatesDt.Contains(ps.Date.Date) &&
                   ps.Status == PlannedSlotStatus.Planned);

    if (req.TherapistId.HasValue)
      query = query.Where(ps => ps.TherapistId == req.TherapistId.Value);

    var slots = await query.ToListAsync();

    var movedSlots = new List<object>();

    foreach (var slot in slots) {
      var therapy = slot.Therapy;
      if (therapy == null) continue;

      if (therapy.Type == TherapyType.Legge11) {
        movedSlots.Add(new {
          SlotId        = slot.Id,
          PatientName   = therapy.Patient?.FullName ?? "–",
          OriginalDate  = slot.Date.ToString("yyyy-MM-dd"),
          NewDate       = (string?)null,
          Action        = "removed",
          TherapistName = slot.Therapist?.FullName ?? "–"
        });
        continue;
      }

      // find next valid date for this slot
      var newDate = await FindNextAvailableDate(slot, affectedDatesDt);
      movedSlots.Add(new {
        SlotId        = slot.Id,
        PatientName   = therapy.Patient?.FullName ?? "–",
        OriginalDate  = slot.Date.ToString("yyyy-MM-dd"),
        NewDate       = newDate?.ToString("yyyy-MM-dd"),
        Action        = newDate.HasValue ? "moved" : "unresolved",
        TherapistName = slot.Therapist?.FullName ?? "–"
      });
    }

    return Ok(new { movedSlots });
  }

  [Authorize]
  [HttpPost("api/vacations")]
  public async Task<IActionResult> CreateVacation([FromBody] VacationRequest req) {
    if (!IsAdmin()) return Forbid();

    var vacation = new Vacation {
      Name              = req.Name,
      TherapistId       = req.TherapistId,
      IsYearIndependent = req.IsYearIndependent,
      Month             = req.Month,
      Day               = req.Day,
      StartDate         = !string.IsNullOrEmpty(req.StartDate) ? DateOnly.Parse(req.StartDate) : null,
      EndDate           = !string.IsNullOrEmpty(req.EndDate)   ? DateOnly.Parse(req.EndDate)   : null
    };
    _db.Vacations.Add(vacation);
    await _db.SaveChangesAsync();

    // apply slot movements
    var affectedDates   = GetVacationDates(req);
    var affectedDatesDt = affectedDates.Select(d => d.ToDateTime(TimeOnly.MinValue).Date).ToList();

    var query = _db.PlannedSlots
      .Include(ps => ps.Therapy)
      .Where(ps => affectedDatesDt.Contains(ps.Date.Date) &&
                   ps.Status == PlannedSlotStatus.Planned);

    if (req.TherapistId.HasValue)
      query = query.Where(ps => ps.TherapistId == req.TherapistId.Value);

    var slots = await query.ToListAsync();

    foreach (var slot in slots) {
      if (slot.Therapy?.Type == TherapyType.Legge11) {
        _db.PlannedSlots.Remove(slot);
      } else {
        var newDate = await FindNextAvailableDate(slot, affectedDatesDt);
        if (newDate.HasValue) slot.Date = newDate.Value.ToDateTime(slot.StartTime);
        else _db.PlannedSlots.Remove(slot);
      }
    }

    await _db.SaveChangesAsync();
    return Ok(new { vacation.Id });
  }

  [Authorize]
  [HttpDelete("api/vacations/{id}")]
  public async Task<IActionResult> DeleteVacation(int id) {
    if (!IsAdmin()) return Forbid();
    var v = await _db.Vacations.FindAsync(id);
    if (v == null) return NotFound();
    _db.Vacations.Remove(v);
    await _db.SaveChangesAsync();
    return Ok();
  }

  private List<DateOnly> GetVacationDates(VacationRequest req) {
    var dates = new List<DateOnly>();
    if (req.IsYearIndependent && req.Month.HasValue && req.Day.HasValue) {
      // applies every year — for planning purposes generate for next 5 years
      var currentYear = DateTime.Now.Year;
      for (int y = currentYear; y <= currentYear + 5; y++) {
        try { dates.Add(new DateOnly(y, req.Month.Value, req.Day.Value)); } catch { }
      }
    } else if (!string.IsNullOrEmpty(req.StartDate) && !string.IsNullOrEmpty(req.EndDate)) {
      var start = DateOnly.Parse(req.StartDate);
      var end   = DateOnly.Parse(req.EndDate);
      for (var d = start; d <= end; d = d.AddDays(1))
        dates.Add(d);
    }
    return dates;
  }

  private async Task<DateOnly?> FindNextAvailableDate(PlannedSlot slot, List<DateTime> blockedDates) {
    var avail = await _db.TherapistAvailabilities
      .Where(a => a.UserId == slot.TherapistId)
      .ToListAsync();

    var allVacations = await _db.Vacations
      .Where(v => v.TherapistId == null || v.TherapistId == slot.TherapistId)
      .ToListAsync();

    var candidate = DateOnly.FromDateTime(slot.Date).AddDays(1);
    int maxTries  = 365;

    while (maxTries-- > 0) {
      // skip weekends
      if (candidate.DayOfWeek == DayOfWeek.Saturday || candidate.DayOfWeek == DayOfWeek.Sunday) {
        candidate = candidate.AddDays(1);
        continue;
      }

      int dow = (int)candidate.DayOfWeek; // 1=Mon
      if (dow == 0) dow = 7;

      // must match same day of week as original
      int originalDow = (int)slot.Date.DayOfWeek;
      if (originalDow == 0) originalDow = 7;
      if (dow != originalDow) { candidate = candidate.AddDays(1); continue; }

      // check therapist availability
      bool inAvail = avail.Any(a =>
        a.DayOfWeek == dow &&
        slot.StartTime.Hour >= a.StartTime.Hour &&
        slot.StartTime.Hour < a.EndTime.Hour);
      if (!inAvail) { candidate = candidate.AddDays(1); continue; }

      // check not blocked by vacation
      bool isBlocked = blockedDates.Any(b => b.Date == candidate.ToDateTime(TimeOnly.MinValue).Date);
      if (isBlocked) { candidate = candidate.AddDays(1); continue; }

      bool isVacation = allVacations.Any(v => {
        if (v.IsYearIndependent && v.Month.HasValue && v.Day.HasValue)
          return candidate.Month == v.Month && candidate.Day == v.Day;
        if (v.StartDate.HasValue && v.EndDate.HasValue)
          return candidate >= v.StartDate && candidate <= v.EndDate;
        return false;
      });
      if (isVacation) { candidate = candidate.AddDays(1); continue; }

      // check no existing slot conflict
      var conflict = await _db.PlannedSlots.AnyAsync(ps =>
        ps.TherapistId == slot.TherapistId &&
        ps.Date.Date   == candidate.ToDateTime(TimeOnly.MinValue).Date &&
        ps.StartTime   == slot.StartTime);
      if (conflict) { candidate = candidate.AddDays(1); continue; }

      return candidate;
    }
    return null;
  }

  // ── Prime Disponibilità ──────────────────────────────────────

  [Authorize]
  [HttpGet("api/calendar/availability")]
  public async Task<IActionResult> GetPrimeDisponibilita([FromQuery] int structureId) {
    var therapists = await _db.Users
      .Where(u => u.StructureId == structureId &&
                  (u.Roles & UserRoles.Therapist) != 0 &&
                  !u.IsSuspended)
      .ToListAsync();

    var tIds = therapists.Select(t => t.Id).ToList();

    var availabilities = await _db.TherapistAvailabilities
      .Where(a => tIds.Contains(a.UserId))
      .ToListAsync();

    var vacations = await _db.Vacations
      .Where(v => v.TherapistId == null || (v.TherapistId.HasValue && tIds.Contains(v.TherapistId.Value)))
      .ToListAsync();

    var today     = DateOnly.FromDateTime(DateTime.Now);
    var maxDate   = today.AddMonths(1);
    var result    = new List<object>();

    foreach (var therapist in therapists) {
      var thAvail = availabilities.Where(a => a.UserId == therapist.Id).ToList();
      var slots   = new List<object>();
      var current = today.AddDays(1);

      while (current <= maxDate && slots.Count < 5) {
        int dow = (int)current.DayOfWeek;
        if (dow == 0 || dow == 6) { current = current.AddDays(1); continue; }

        // check vacation
        bool isVac = vacations.Any(v => {
          if (v.IsYearIndependent && v.Month.HasValue && v.Day.HasValue)
            return current.Month == v.Month && current.Day == v.Day &&
                   (v.TherapistId == null || v.TherapistId == therapist.Id);
          if (v.StartDate.HasValue && v.EndDate.HasValue)
            return current >= v.StartDate && current <= v.EndDate &&
                   (v.TherapistId == null || v.TherapistId == therapist.Id);
          return false;
        });
        if (isVac) { current = current.AddDays(1); continue; }

        var dayAvail = thAvail.Where(a => a.DayOfWeek == dow).ToList();

        // get existing planned slots for this day
        var dayStart = current.ToDateTime(TimeOnly.MinValue);
        var dayEnd   = current.ToDateTime(TimeOnly.MaxValue);
        var busyHours = await _db.PlannedSlots
          .Where(ps => ps.TherapistId == therapist.Id &&
                       ps.Date >= dayStart && ps.Date <= dayEnd)
          .Select(ps => ps.StartTime.Hour)
          .ToListAsync();

        // get group hours for this day
        var groupHours = await _db.Groups
          .Where(g => g.TherapistId == therapist.Id &&
                      g.DayOfWeek == dow &&
                      (!g.EndDate.HasValue || g.EndDate.Value > dayStart))
          .Select(g => g.StartTime.Hour)
          .ToListAsync();

        var allBusy = busyHours.Concat(groupHours).ToHashSet();

        foreach (var avail in dayAvail.OrderBy(a => a.StartTime.Hour)) {
          for (int hour = avail.StartTime.Hour; hour < avail.EndTime.Hour && slots.Count < 5; hour++) {
            if (!allBusy.Contains(hour)) {
              slots.Add(new {
                Date    = current.ToString("yyyy-MM-dd"),
                DayOfWeek = dow,
                Hour    = hour
              });
            }
          }
        }

        current = current.AddDays(1);
      }

      // find first available group slot for M and F
      var therapistGroups = await _db.Groups
        .Where(g => g.TherapistId == therapist.Id &&
                    (!g.EndDate.HasValue || g.EndDate.Value > DateTime.Now))
        .ToListAsync();

      object? firstGroupM = null, firstGroupF = null;

      foreach (var sex in new[] { "M", "F" }) {
        var sexGroups = therapistGroups
          .Where(g => g.Sex == sex)
          .ToList();

        foreach (var g in sexGroups) {
          var memberCount = await _db.GroupTherapies.CountAsync(gt => gt.GroupId == g.Id);
          if (memberCount >= 5) continue; // must have space (< 5)

          // find next occurrence of this group's day after today
          var check = today.AddDays(1);
          while (check <= maxDate) {
            int checkDow = (int)check.DayOfWeek;
            if (checkDow == g.DayOfWeek) {
              // check vacation
              bool isVac2 = vacations.Any(v => {
                if (v.IsYearIndependent && v.Month.HasValue && v.Day.HasValue)
                  return check.Month == v.Month && check.Day == v.Day && v.TherapistId == null;
                if (v.StartDate.HasValue && v.EndDate.HasValue)
                  return check >= v.StartDate && check <= v.EndDate && v.TherapistId == null;
                return false;
              });
              if (!isVac2) {
                var slot = new {
                  Date       = check.ToString("yyyy-MM-dd"),
                  DayOfWeek  = checkDow,
                  Hour       = g.StartTime.Hour,
                  Sex        = sex,
                  MemberCount = memberCount,
                  GroupId    = g.Id
                };
                if (sex == "M" && firstGroupM == null) firstGroupM = slot;
                if (sex == "F" && firstGroupF == null) firstGroupF = slot;
                break;
              }
            }
            check = check.AddDays(1);
          }
          if ((sex == "M" && firstGroupM != null) || (sex == "F" && firstGroupF != null)) break;
        }
      }

      result.Add(new {
        TherapistId    = therapist.Id,
        TherapistName  = therapist.FullName,
        TherapistColor = therapist.Color,
        Slots          = slots,
        FirstGroupM    = firstGroupM,
        FirstGroupF    = firstGroupF
      });
    }

    return Ok(result);
  }

  // ── Calendar Period ──────────────────────────────────────

  [Authorize]
  [HttpGet("api/calendar/period")]
  public async Task<IActionResult> GetCalendarPeriod(
    [FromQuery] int    structureId,
    [FromQuery] int?   therapistId,
    [FromQuery] string startDate,
    [FromQuery] string endDate) {

    if (!DateOnly.TryParse(startDate, out var start) ||
        !DateOnly.TryParse(endDate,   out var end))
      return BadRequest(new { error = "Date non valide" });

    var startDt = start.ToDateTime(TimeOnly.MinValue);
    var endDt   = end.ToDateTime(TimeOnly.MaxValue);

    // therapists
    var therapistQuery = _db.Users
      .Where(u => u.StructureId == structureId &&
                  (u.Roles & UserRoles.Therapist) != 0 &&
                  !u.IsSuspended);
    if (therapistId.HasValue)
      therapistQuery = therapistQuery.Where(u => u.Id == therapistId.Value);

    var therapists = await therapistQuery
      .Select(u => new { u.Id, u.FullName, u.Color })
      .ToListAsync();

    var tIds = therapists.Select(t => t.Id).ToList();

    // availabilities
    var availabilities = await _db.TherapistAvailabilities
      .Where(a => tIds.Contains(a.UserId))
      .Select(a => new {
        a.UserId,
        a.DayOfWeek,
        StartHour = a.StartTime.Hour,
        EndHour   = a.EndTime.Hour
      })
      .ToListAsync();

    // groups with member count
    var groups = await _db.Groups
      .Where(g => tIds.Contains(g.TherapistId) &&
                  (!g.EndDate.HasValue || g.EndDate.Value > startDt))
      .Include(g => g.Therapist)
      .Select(g => new {
        g.Id,
        g.TherapistId,
        TherapistName  = g.Therapist!.FullName,
        TherapistColor = g.Therapist.Color,
        g.DayOfWeek,
        StartHour      = g.StartTime.Hour,
        g.Sex,
        MemberCount    = _db.GroupTherapies.Count(gt => gt.GroupId == g.Id)
      })
      .ToListAsync();

    // planned slots with patient name
    var plannedSlots = await _db.PlannedSlots
      .Where(ps => tIds.Contains(ps.TherapistId) &&
                   ps.Date >= startDt && ps.Date <= endDt &&
                   ps.Status == PlannedSlotStatus.Planned)
      .Include(ps => ps.Therapy)
        .ThenInclude(t => t!.Patient)
      .Include(ps => ps.Therapist)
      .Select(ps => new {
        ps.Id,
        ps.TherapistId,
        TherapistColor = ps.Therapist!.Color,
        Date           = ps.Date.ToString("yyyy-MM-dd"),
        StartHour      = ps.StartTime.Hour,
        PatientName    = ps.Therapy!.Patient!.FullName,
        ps.GroupId
      })
      .ToListAsync();

    // vacations overlapping the period
    var vacations = await _db.Vacations
      .Where(v => v.TherapistId == null ||
                  (v.TherapistId.HasValue && tIds.Contains(v.TherapistId.Value)))
      .Select(v => new {
        v.Id, v.Name, v.TherapistId,
        v.IsYearIndependent, v.Month, v.Day,
        StartDate = v.StartDate.HasValue ? v.StartDate.Value.ToString("yyyy-MM-dd") : null,
        EndDate   = v.EndDate.HasValue   ? v.EndDate.Value.ToString("yyyy-MM-dd")   : null
      })
      .ToListAsync();

    return Ok(new { therapists, availabilities, groups, plannedSlots, vacations });
  }

  // ── Planning ──────────────────────────────────────────────

  [Authorize]
  [HttpGet("api/planning/slots")]
  public async Task<IActionResult> GetPlanningSlots(
    [FromQuery] int structureId,
    [FromQuery] int therapyType,
    [FromQuery] string sex,
    [FromQuery] string weekStart) {

    if (!IsAdmin()) return Forbid();
    if (!DateOnly.TryParse(weekStart, out var weekStartDate))
      return BadRequest(new { error = "Data non valida" });

    // get therapists for this structure
    var therapists = await _db.Users
      .Where(u => u.StructureId == structureId &&
                  (u.Roles & UserRoles.Therapist) != 0 &&
                  !u.IsSuspended)
      .ToListAsync();

    var therapistIds = therapists.Select(t => t.Id).ToList();

    // get availabilities
    var availabilities = await _db.TherapistAvailabilities
      .Where(a => therapistIds.Contains(a.UserId))
      .ToListAsync();

    // get existing planned slots for this week
    var weekEnd = weekStartDate.AddDays(4);
    var weekStartDt = weekStartDate.ToDateTime(TimeOnly.MinValue);
    var weekEndDt   = weekEnd.ToDateTime(TimeOnly.MaxValue);

    var existingSlots = await _db.PlannedSlots
      .Where(ps => therapistIds.Contains(ps.TherapistId) &&
                   ps.Date >= weekStartDt && ps.Date <= weekEndDt)
      .Select(ps => new { ps.TherapistId, ps.Date, StartTime = ps.StartTime.ToString("HH:mm") })
      .ToListAsync();

    // get active groups - always returned regardless of therapy type
    List<object> groups = new();
    var rawGroups = await _db.Groups
      .Where(g => therapistIds.Contains(g.TherapistId) &&
                  (!g.EndDate.HasValue || g.EndDate.Value > DateTime.Now))
      .Include(g => g.Therapist)
      .ToListAsync();

    foreach (var g in rawGroups) {
      var memberCount = await _db.GroupTherapies.CountAsync(gt => gt.GroupId == g.Id);
      bool selectable = therapyType == (int)TherapyType.HktGroup &&
                        memberCount < 6 &&
                        (string.IsNullOrEmpty(sex) || g.Sex == sex || g.Sex == "X");
      groups.Add(new {
        g.Id,
        g.TherapistId,
        TherapistName  = g.Therapist!.FullName,
        TherapistColor = g.Therapist.Color,
        g.DayOfWeek,
        StartTime      = g.StartTime.ToString("HH:mm"),
        g.Sex,
        MemberCount    = memberCount,
        IsAtLimit      = memberCount == 5,
        Selectable     = selectable
      });
    }

    // build slot matrix: for each therapist, for each available day+hour, check if free
    var slots = new List<object>();
    foreach (var t in therapists) {
      var tavail = availabilities.Where(a => a.UserId == t.Id).ToList();
      foreach (var avail in tavail) {
        // generate hours in this availability block
        for (int hour = avail.StartTime.Hour; hour < avail.EndTime.Hour; hour++) {
          // check which days of this week this therapist is available
          // avail.DayOfWeek: 1=Mon..5=Fri
          var date = weekStartDate.AddDays(avail.DayOfWeek - 1);
          var dateDt = date.ToDateTime(new TimeOnly(hour, 0));

          // skip if already has a planned slot
          bool busy = existingSlots.Any(es =>
            es.TherapistId == t.Id &&
            es.Date.Date == dateDt.Date &&
            es.StartTime == $"{hour:D2}:00");

          if (busy) continue;

          // skip if therapist has a group at this day+hour
          bool hasGroup = rawGroups.Any(g =>
            g.TherapistId == t.Id &&
            g.DayOfWeek   == avail.DayOfWeek &&
            g.StartTime.Hour == hour);

          if (hasGroup) continue;

          slots.Add(new {
            TherapistId   = t.Id,
            TherapistName = t.FullName,
            TherapistColor = t.Color,
            DayOfWeek     = avail.DayOfWeek,
            Date          = date.ToString("yyyy-MM-dd"),
            Hour          = hour
          });
        }
      }
    }

    // occupied slots this week (for display) - load all at once to avoid EF issues
    var occupiedPlanned = await _db.PlannedSlots
      .Include(p => p.Therapy).ThenInclude(t => t!.Patient)
      .Include(p => p.Group)
      .Where(p => therapistIds.Contains(p.TherapistId) &&
                  p.Date >= weekStartDt && p.Date <= weekEndDt)
      .ToListAsync();

    var groupMemberCounts = new Dictionary<int, int>();
    foreach (var gid in occupiedPlanned.Where(p => p.GroupId.HasValue).Select(p => p.GroupId!.Value).Distinct()) {
      groupMemberCounts[gid] = await _db.GroupTherapies.CountAsync(gt => gt.GroupId == gid);
    }

    var occupied = occupiedPlanned.Select(ps => {
      var th = therapists.FirstOrDefault(t => t.Id == ps.TherapistId);
      if (th == null) return null;
      string label;
      if (ps.GroupId.HasValue && ps.Group != null) {
        var mc = groupMemberCounts.TryGetValue(ps.GroupId.Value, out var c) ? c : 0;
        label = $"Gruppo {ps.Group.Sex} [{mc}/5]";
      } else {
        label = ps.Therapy?.Patient?.FullName ?? "–";
      }
      var d = DateOnly.FromDateTime(ps.Date);
      int dow = (int)d.DayOfWeek; if (dow == 0) dow = 7;
      return (object)new {
        TherapistId    = th.Id,
        TherapistColor = th.Color,
        DayOfWeek      = dow,
        Date           = d.ToString("yyyy-MM-dd"),
        Hour           = ps.StartTime.Hour,
        Label          = label
      };
    }).Where(x => x != null).ToList();

    return Ok(new { slots, groups, occupied });
  }

  [Authorize]
  [HttpPost("api/planning/preview")]
  public async Task<IActionResult> PreviewPlanning([FromBody] PlanningPreviewRequest req) {
    if (!IsAdmin()) return Forbid();

    // validate therapy
    var therapy = await _db.Therapies.FindAsync(req.TherapyId);
    if (therapy == null) return NotFound();

    // get therapist availability
    var avail = await _db.TherapistAvailabilities
      .Where(a => a.UserId == req.TherapistId)
      .ToListAsync();

    var generatedSlots = new List<object>();
    int sessionCount   = 0;
    var isL11          = therapy.Type == TherapyType.Legge11;
    var totalSessions  = therapy.Duration;

    // start from the date of the first selected slot
    var startDate = DateOnly.Parse(req.WeekPattern.OrderBy(p => p.DayOfWeek).First().Date);
    DateTime? endDate = isL11
      ? startDate.ToDateTime(TimeOnly.MinValue).AddDays(totalSessions)
      : (DateTime?)null;

    var current = startDate.ToDateTime(TimeOnly.MinValue);
    // go back to Monday of start week
    int startDow = (int)current.DayOfWeek;
    if (startDow == 0) startDow = 7;
    current = current.AddDays(-(startDow - 1));

    int maxWeeks = 520; // safety cap ~10 years
    int week     = 0;

    while (week < maxWeeks) {
      foreach (var pattern in req.WeekPattern.OrderBy(p => p.DayOfWeek)) {
        var slotDate = current.AddDays(pattern.DayOfWeek - 1);

        // skip if before start date
        if (slotDate.Date < startDate.ToDateTime(TimeOnly.MinValue).Date) continue;

        // stop conditions
        if (isL11 && slotDate > endDate) goto done;
        if (!isL11 && sessionCount >= totalSessions) goto done;

        // check therapist availability at this day+hour
        int dow = pattern.DayOfWeek;
        bool inAvail = avail.Any(a =>
          a.DayOfWeek == dow &&
          pattern.Hour >= a.StartTime.Hour &&
          pattern.Hour < a.EndTime.Hour);

        if (!inAvail) continue;

        // skip vacation days
        var slotDateOnly = DateOnly.FromDateTime(slotDate);
        var vacations = await _db.Vacations
          .Where(v => v.TherapistId == null || v.TherapistId == req.TherapistId)
          .ToListAsync();
        bool isVacation = vacations.Any(v => {
          if (v.IsYearIndependent && v.Month.HasValue && v.Day.HasValue)
            return slotDateOnly.Month == v.Month && slotDateOnly.Day == v.Day;
          if (v.StartDate.HasValue && v.EndDate.HasValue)
            return slotDateOnly >= v.StartDate && slotDateOnly <= v.EndDate;
          return false;
        });
        if (isVacation) continue;

        // check for existing conflicts
        var conflictDate = slotDate.Date;
        bool conflict = await _db.PlannedSlots.AnyAsync(ps =>
          ps.TherapistId == req.TherapistId &&
          ps.Date.Date == conflictDate &&
          ps.StartTime == new TimeOnly(pattern.Hour, 0));

        generatedSlots.Add(new {
          Date          = slotDate.ToString("yyyy-MM-dd"),
          DayName       = slotDate.ToString("dddd"),
          Hour          = pattern.Hour,
          TherapistId   = req.TherapistId,
          HasConflict   = conflict,
          SessionNumber = isL11 ? (int?)null : sessionCount + 1
        });

        if (!conflict) sessionCount++;
      }

      current = current.AddDays(7);
      week++;
    }

    done:
    bool incomplete = !isL11 && sessionCount < totalSessions;

    return Ok(new {
      slots        = generatedSlots,
      sessionCount,
      totalSessions,
      incomplete,
      isL11,
      endDate      = endDate?.ToString("yyyy-MM-dd")
    });
  }

  [Authorize]
  [HttpPost("api/planning/confirml11")]
  public async Task<IActionResult> ConfirmL11Planning([FromBody] PlanningConfirmL11Request req) {
    if (!IsAdmin()) return Forbid();

    var therapy = await _db.Therapies.FindAsync(req.TherapyId);
    if (therapy == null) return NotFound();

    var avail = await _db.TherapistAvailabilities
      .Where(a => a.UserId == req.TherapistId)
      .ToListAsync();

    var vacations = await _db.Vacations
      .Where(v => v.TherapistId == null || v.TherapistId == req.TherapistId)
      .ToListAsync();

    // start date from first pattern slot
    var startDate = DateOnly.Parse(req.Pattern.OrderBy(p => p.DayOfWeek).First().Date);
    var endDate   = startDate.ToDateTime(TimeOnly.MinValue).AddDays(therapy.Duration);

    var current = getMondayOf(startDate);
    int safety  = 0;

    while (current.ToDateTime(TimeOnly.MinValue) <= endDate && safety++ < 520) {
      foreach (var p in req.Pattern.OrderBy(x => x.DayOfWeek)) {
        var slotDate = current.AddDays(p.DayOfWeek - 1);
        if (slotDate.ToDateTime(TimeOnly.MinValue) < startDate.ToDateTime(TimeOnly.MinValue)) continue;
        if (slotDate.ToDateTime(TimeOnly.MinValue) > endDate) break;

        // check therapist availability
        bool inAvail = avail.Any(a =>
          a.DayOfWeek == p.DayOfWeek &&
          p.Hour >= a.StartTime.Hour &&
          p.Hour < a.EndTime.Hour);
        if (!inAvail) continue;

        // skip vacations
        bool isVac = vacations.Any(v => {
          if (v.IsYearIndependent && v.Month.HasValue && v.Day.HasValue)
            return slotDate.Month == v.Month && slotDate.Day == v.Day;
          if (v.StartDate.HasValue && v.EndDate.HasValue)
            return slotDate >= v.StartDate && slotDate <= v.EndDate;
          return false;
        });
        if (isVac) continue;

        // skip conflicts
        var slotDt = slotDate.ToDateTime(TimeOnly.MinValue);
        bool conflict = await _db.PlannedSlots.AnyAsync(ps =>
          ps.TherapistId == req.TherapistId &&
          ps.Date.Date   == slotDt.Date &&
          ps.StartTime   == new TimeOnly(p.Hour, 0));
        if (conflict) continue;

        _db.PlannedSlots.Add(new PlannedSlot {
          TherapyId   = req.TherapyId,
          TherapistId = req.TherapistId,
          GroupId     = null,
          Date        = slotDt,
          StartTime   = new TimeOnly(p.Hour, 0),
          Status      = PlannedSlotStatus.Planned
        });
      }
      current = current.AddDays(7);
    }

    therapy.Status = TherapyStatus.InProgress;
    await _db.SaveChangesAsync();
    return Ok();
  }

  private static DateOnly getMondayOf(DateOnly d) {
    int dow = (int)d.DayOfWeek;
    if (dow == 0) dow = 7;
    return d.AddDays(-(dow - 1));
  }

  [Authorize]
  [HttpPost("api/planning/confirm")]
  public async Task<IActionResult> ConfirmPlanning([FromBody] PlanningConfirmRequest req) {
    if (!IsAdmin()) return Forbid();

    var therapy = await _db.Therapies
      .Include(t => t.Patient)
      .FirstOrDefaultAsync(t => t.Id == req.TherapyId);
    if (therapy == null) return NotFound();

    foreach (var slot in req.Slots) {
      if (!DateTime.TryParse(slot.Date, out var date)) continue;
      var planned = new PlannedSlot {
        TherapyId   = req.TherapyId,
        TherapistId = req.TherapistId,
        GroupId     = req.GroupId,
        Date        = date,
        StartTime   = new TimeOnly(slot.Hour, 0),
        Status      = PlannedSlotStatus.Planned
      };
      _db.PlannedSlots.Add(planned);
    }

    // if group therapy, link to group
    if (req.GroupId.HasValue) {
      var alreadyLinked = await _db.GroupTherapies
        .AnyAsync(gt => gt.GroupId == req.GroupId && gt.TherapyId == req.TherapyId);
      if (!alreadyLinked) {
        _db.GroupTherapies.Add(new GroupTherapy {
          GroupId   = req.GroupId.Value,
          TherapyId = req.TherapyId
        });
      }
    }

    therapy.Status = TherapyStatus.InProgress;
    await _db.SaveChangesAsync();
    return Ok();
  }

  // ── Therapy Slots (for print) ────────────────────────────────

  [Authorize]
  [HttpGet("api/patients/{patientId}/therapies/{id}/slots")]
  public async Task<IActionResult> GetTherapySlots(int patientId, int id) {
    var therapy = await _db.Therapies.FirstOrDefaultAsync(t => t.Id == id && t.PatientId == patientId);
    if (therapy == null) return NotFound();

    var slots = await _db.PlannedSlots
      .Where(ps => ps.TherapyId == id)
      .Include(ps => ps.Therapist)
      .OrderBy(ps => ps.Date)
      .Select(ps => new {
        ps.Id,
        Date           = ps.Date.ToString("yyyy-MM-dd"),
        StartHour      = ps.StartTime.Hour,
        ps.Status,
        TherapistName  = ps.Therapist != null ? ps.Therapist.FullName : ""
      })
      .ToListAsync();

    return Ok(slots);
  }

  // ── Therapist Availability ────────────────────────────────

  [Authorize]
  [HttpGet("api/admin/users/{id}/availability")]
  public async Task<IActionResult> GetAvailability(int id) {
    if (!IsAdmin()) return Forbid();
    var slots = await _db.TherapistAvailabilities
      .Where(a => a.UserId == id)
      .OrderBy(a => a.DayOfWeek)
      .ThenBy(a => a.StartTime)
      .Select(a => new {
        a.Id,
        a.DayOfWeek,
        StartTime = a.StartTime.ToString("HH:mm"),
        EndTime   = a.EndTime.ToString("HH:mm")
      })
      .ToListAsync();
    return Ok(slots);
  }

  [Authorize]
  [HttpPost("api/admin/users/{id}/availability")]
  public async Task<IActionResult> SaveAvailability(int id, [FromBody] List<AvailabilitySlotRequest> slots) {
    if (!IsAdmin()) return Forbid();

    // validate
    foreach (var s in slots) {
      if (!TimeOnly.TryParse(s.StartTime, out var start) ||
          !TimeOnly.TryParse(s.EndTime,   out var end))
        return BadRequest(new { error = "Formato orario non valido" });
      if (start >= end)
        return BadRequest(new { error = $"Orario non valido nel giorno {s.DayOfWeek}: l'inizio deve essere precedente alla fine" });
    }

    // replace all slots for this user
    var existing = _db.TherapistAvailabilities.Where(a => a.UserId == id);
    _db.TherapistAvailabilities.RemoveRange(existing);

    foreach (var s in slots) {
      _db.TherapistAvailabilities.Add(new TherapistAvailability {
        UserId    = id,
        DayOfWeek = s.DayOfWeek,
        StartTime = TimeOnly.Parse(s.StartTime),
        EndTime   = TimeOnly.Parse(s.EndTime)
      });
    }

    await _db.SaveChangesAsync();
    return Ok();
  }
}

// ── Request DTOs ─────────────────────────────────────────────

public record LoginRequest(string LoginName, string Password);

public record UserRequest(
  string LoginName,
  string FullName,
  string Email,
  string Phone,
  string Password,
  int Color,
  int Roles,
  int? StructureId
);

public record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public record PatientRequest(
  string FullName,
  string CodiceFiscale,
  string Sesso,
  string Telefono,
  string PreferenzaOrario,
  bool InGruppo,
  int? PreferredStructureId
);

public record AvailabilitySlotRequest(
  int DayOfWeek,
  string StartTime,
  string EndTime
);

public record PaymentTypeRequest(
  string Name,
  int Type
);

public record TherapyRequest(
  TherapyType Type,
  int PaymentTypeId,
  int Duration,
  bool APacchetto,
  TherapyStatus Status,
  string? Notes
);

public record GroupRequest(
  int TherapistId,
  string Sex,
  int DayOfWeek,
  string StartTime,
  DateTime? EndDate
);

public record UserUpdateRequest(
  string LoginName,
  string FullName,
  string Email,
  string Phone,
  string Password,
  int Color,
  int Roles,
  int? StructureId
);

public record ArchiveGroupRequest(DateTime? EndDate);

public record PatientUpdateRequest(
  string FullName,
  string CodiceFiscale,
  string Sesso,
  string Telefono,
  string PreferenzaOrario,
  bool InGruppo,
  int? PreferredStructureId
);

public record AlertNotesRequest(string? Notes);

public record VacationRequest(
  string Name,
  int? TherapistId,
  bool IsYearIndependent,
  int? Month,
  int? Day,
  string? StartDate,
  string? EndDate
);

public record WeekPatternSlot(int DayOfWeek, string Date, int Hour);

public record L11PatternSlot(int DayOfWeek, string Date, int Hour);

public record PlanningConfirmL11Request(
  int TherapyId,
  int TherapistId,
  List<L11PatternSlot> Pattern
);

public record PlanningPreviewRequest(
  int TherapyId,
  int TherapistId,
  int? GroupId,
  List<WeekPatternSlot> WeekPattern
);

public record ConfirmSlot(string Date, int Hour);

public record PlanningConfirmRequest(
  int TherapyId,
  int TherapistId,
  int? GroupId,
  List<ConfirmSlot> Slots
);
