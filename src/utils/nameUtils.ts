/**
 * Utility to format email handles into readable names.
 * Example: "abhinav.m2024@vitstudent.ac.in" -> "Abhinav M"
 * Example: "sharangoshreddy" -> "Sharangoshreddy"
 */
export const formatEmailToName = (nameOrEmail: string | undefined | null): string => {
  if (!nameOrEmail) return 'User';
  
  // If it's an email, just take the handle
  const handle = nameOrEmail.includes('@') ? nameOrEmail.split('@')[0] : nameOrEmail;
  
  // Split by dots, underscores, or spaces
  const parts = handle.split(/[._\s]+/);
  
  // Format each part
  const formattedParts = parts.map(part => {
    // Remove numbers (common in student IDs like 2024)
    const textOnly = part.replace(/\d+/g, '').trim();
    
    if (!textOnly) return '';
    
    // Capitalize first letter, keep the rest as is if it's already mixed case,
    // otherwise lowercase the rest. This preserves "Abhinav M" -> "Abhinav M"
    // but fixes "abhinav" -> "Abhinav"
    const first = textOnly.charAt(0).toUpperCase();
    const rest = textOnly.slice(1);
    
    // If the rest is all uppercase or all lowercase, we probably want to normalize it.
    // If it's mixed case (like "McDonald"), we leave it.
    if (rest === rest.toUpperCase() || rest === rest.toLowerCase()) {
      return first + rest.toLowerCase();
    }
    return first + rest;
  }).filter(Boolean);
  
  const result = formattedParts.join(' ');
  return result || 'User';
};
