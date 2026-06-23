namespace PlanningPiscine.Models;

public enum PlannedSlotStatus {
  Planned,
  Completed,
  Absent,
  Recovered
}

public class PlannedSlot {
  public int Id { get; set; }
  public int TherapyId { get; set; }
  public int TherapistId { get; set; }
  public int? GroupId { get; set; }
  public DateTime Date { get; set; }
  public TimeOnly StartTime { get; set; }
  public PlannedSlotStatus Status { get; set; } = PlannedSlotStatus.Planned;
  public string? Notes { get; set; }

  public Therapy? Therapy { get; set; }
  public User? Therapist { get; set; }
  public Group? Group { get; set; }
}
