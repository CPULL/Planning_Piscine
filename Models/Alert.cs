namespace PlanningPiscine.Models;

public enum AlertType {
  TherapyEnding,
  TherapyInVacation
}

public class Alert {
  public int Id { get; set; }
  public int? TherapyId { get; set; }
  public int? UserId { get; set; }
  public int? PatientId { get; set; }
  public AlertType Type { get; set; } = AlertType.TherapyEnding;
  public string? Notes { get; set; }
  public DateTime LastSlot { get; set; } = DateTime.Now;
  public DateTime CreatedAt { get; set; } = DateTime.Now;
  public DateTime? DismissedAt { get; set; }

  public Therapy? Therapy { get; set; }
  public User? User { get; set; }
  public Patient? Patient { get; set; }
}
