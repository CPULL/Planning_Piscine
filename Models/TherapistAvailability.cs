namespace PlanningPiscine.Models;

public class TherapistAvailability {
  public int Id { get; set; }
  public int UserId { get; set; }
  public int DayOfWeek { get; set; } // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
  public TimeOnly StartTime { get; set; }
  public TimeOnly EndTime { get; set; }

  public User? User { get; set; }
}
