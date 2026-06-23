namespace PlanningPiscine.Models;

public class User {
  public int Id { get; set; }
  public string LoginName { get; set; } = string.Empty;
  public string FullName { get; set; } = string.Empty;
  public string Email { get; set; } = string.Empty;
  public string Phone { get; set; } = string.Empty;
  public string PasswordHash { get; set; } = string.Empty;
  public bool IsSuspended { get; set; } = false;
  public int Color { get; set; } = 0;
  public int Roles { get; set; } = 0;
  public int StructureId { get; set; } = 1;

  public Structure? Structure { get; set; }
}

public static class UserRoles {
  public const int Admin     = 1;
  public const int Therapist = 2;
}
