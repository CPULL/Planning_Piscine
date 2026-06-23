namespace PlanningPiscine.Models;

public class Group {
  public int Id { get; set; }
  public int TherapistId { get; set; }
  public int DayOfWeek { get; set; } // 1=Mon ... 5=Fri
  public TimeOnly StartTime { get; set; }
  public string Sex { get; set; } = string.Empty; // M or F
  public DateTime? EndDate { get; set; }

  public User? Therapist { get; set; }
}
