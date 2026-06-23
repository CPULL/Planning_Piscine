using Microsoft.EntityFrameworkCore;
using PlanningPiscine.Data;
using PlanningPiscine.Models;

namespace PlanningPiscine.Services;

public class AlertService : BackgroundService {
  private readonly IServiceScopeFactory _scopeFactory;
  private readonly ILogger<AlertService> _logger;

  public AlertService(IServiceScopeFactory scopeFactory, ILogger<AlertService> logger) {
    _scopeFactory = scopeFactory;
    _logger = logger;
  }

  protected override async Task ExecuteAsync(CancellationToken stoppingToken) {
    while (!stoppingToken.IsCancellationRequested) {
      try {
        await RunAsync();
      } catch (Exception ex) {
        _logger.LogError(ex, "Error in AlertService");
      }
      await Task.Delay(TimeSpan.FromHours(24), stoppingToken);
    }
  }

  private async Task RunAsync() {
    using var scope = _scopeFactory.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

    // 1. Delete dismissed alerts older than 2 months
    var cutoff = DateTime.Now.AddDays(-60);
    var old = await db.Alerts
      .Where(a => a.DismissedAt.HasValue && a.DismissedAt < cutoff)
      .ToListAsync();
    db.Alerts.RemoveRange(old);

    // 2. TherapyEnding: InProgress therapies with <= 3 remaining planned slots
    var inProgress = await db.Therapies
      .Where(t => t.Status == TherapyStatus.InProgress)
      .ToListAsync();

    foreach (var therapy in inProgress) {
      var remaining = await db.PlannedSlots
        .Where(ps => ps.TherapyId == therapy.Id &&
                     ps.Status == PlannedSlotStatus.Planned &&
                     ps.Date >= DateTime.Now)
        .CountAsync();

      if (remaining > 3) continue;

      var exists = await db.Alerts.AnyAsync(a =>
        a.TherapyId == therapy.Id &&
        a.Type == AlertType.TherapyEnding);

      if (exists) continue;

      var lastSlot = await db.PlannedSlots
        .Include(ps => ps.Therapist)
        .Include(ps => ps.Group)
        .Where(ps => ps.TherapyId == therapy.Id &&
                     ps.Status == PlannedSlotStatus.Planned &&
                     ps.Date >= DateTime.Now)
        .OrderByDescending(ps => ps.Date)
        .FirstOrDefaultAsync();

      if (lastSlot == null) continue;

      var therapistId = lastSlot.TherapistId != 0
        ? lastSlot.TherapistId
        : lastSlot.Group?.TherapistId ?? 0;

      db.Alerts.Add(new Alert {
        TherapyId = therapy.Id,
        PatientId = therapy.PatientId,
        UserId    = therapistId != 0 ? therapistId : null,
        Type      = AlertType.TherapyEnding,
        LastSlot  = lastSlot.Date
      });
    }

    // 3. TherapyInVacation: planned slots that fall on a vacation day
    var vacations = await db.Vacations.ToListAsync();
    var futurePlanned = await db.PlannedSlots
      .Include(ps => ps.Therapy)
      .Where(ps => ps.Status == PlannedSlotStatus.Planned &&
                   ps.Date >= DateTime.Now)
      .ToListAsync();

    foreach (var slot in futurePlanned) {
      var slotDate = DateOnly.FromDateTime(slot.Date);

      bool isVacation = vacations.Any(v => {
        if (v.TherapistId.HasValue && v.TherapistId != slot.TherapistId) return false;
        if (v.IsYearIndependent && v.Month.HasValue && v.Day.HasValue)
          return slotDate.Month == v.Month && slotDate.Day == v.Day;
        if (v.StartDate.HasValue && v.EndDate.HasValue)
          return slotDate >= v.StartDate && slotDate <= v.EndDate;
        return false;
      });

      if (!isVacation) continue;

      var exists = await db.Alerts.AnyAsync(a =>
        a.TherapyId == slot.TherapyId &&
        a.Type == AlertType.TherapyInVacation &&
        a.LastSlot == slot.Date);

      if (exists) continue;

      db.Alerts.Add(new Alert {
        TherapyId = slot.TherapyId,
        PatientId = slot.Therapy?.PatientId,
        UserId    = slot.TherapistId != 0 ? slot.TherapistId : null,
        Type      = AlertType.TherapyInVacation,
        LastSlot  = slot.Date
      });
    }

    await db.SaveChangesAsync();
    _logger.LogInformation("AlertService ran at {time}", DateTime.Now);
  }
}
