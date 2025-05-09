import sys
import csv
import os
import json
import re # Import for sanitizing filenames

def create_fdf_header():
    return "%FDF-1.2\n1 0 obj\n<<\n/FDF\n<<\n/Fields [\n"

def create_fdf_footer():
    return "]\n>>\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF"

def escape_fdf_string(s):
    # Escape special characters in FDF strings
    s = str(s)
    # Replace line breaks with \r (carriage return)
    s = s.replace('\n', '\\r').replace('\r', '\\r')
    # Escape parentheses
    s = s.replace(')', '\\)').replace('(', '\\(')
    # Escape backslashes
    s = s.replace('\\', '\\\\')
    return s

def sanitize_filename(name):
    """Sanitizes a string to be used as a filename."""
    # Replace spaces with underscores
    s = name.replace(' ', '_')
    # Remove any characters that are not alphanumeric, underscore, or hyphen
    s = re.sub(r'[^\w.-]', '', s)
    # Trim leading/trailing underscores/hyphens
    s = s.strip('_-')
    return s

def read_csv_data(input_path):
    """Reads the CSV file and returns a list of dictionaries (rows)."""
    all_clients_data = []
    try:
        with open(input_path, 'r', encoding='utf-8', errors='ignore') as csv_file:
            csv_reader = csv.DictReader(csv_file)
            for row in csv_reader:
                all_clients_data.append(row)
        return all_clients_data
    except Exception as e:
        sys.stderr.write(f"Error reading CSV file: {e}\n")
        sys.exit(1) # Exit with an error code

def list_clients(input_path):
    """
    Reads the CSV, extracts client display information, and prints it as JSON.
    """
    all_clients_data = read_csv_data(input_path)

    clients_for_display = []
    # We want the latest first for display, so iterate in reverse with original index
    for i, client_row in enumerate(reversed(all_clients_data)):
        original_index = len(all_clients_data) - 1 - i # Calculate original index
        
        client_surname = client_row.get('Client1Sur', 'N/A')
        client_given = client_row.get('Client1Given', 'N/A')
        client_dob = client_row.get('Client1DOB', 'N/A')
        product_name = client_row.get('Product', 'N/A')
        
        clients_for_display.append({
            'original_index': original_index,
            'display_name': f"{client_surname} {client_given} (DOB: {client_dob}, Product: {product_name})"
        })
    
    # Print the JSON output to stdout for server2.js to capture
    print(json.dumps(clients_for_display))


def convert_selected_client_to_fdf(input_path, output_dir, client_index):
    """
    Converts a specific client's data from CSV to an FDF file.
    output_dir is the directory where the FDF should be saved.
    """
    all_clients_data = read_csv_data(input_path)

    try:
        client_index = int(client_index)
        if not (0 <= client_index < len(all_clients_data)):
            sys.stderr.write(f"Client index {client_index} is out of bounds.\n")
            sys.exit(1)
    except ValueError:
        sys.stderr.write(f"Invalid client index: {client_index}. Must be an integer.\n")
        sys.exit(1)
    
    selected_client_data = all_clients_data[client_index]

    # Generate filename based on client's name
    client_surname = selected_client_data.get('Client1Sur', 'Unnamed')
    client_given = selected_client_data.get('Client1Given', 'Client')
    
    # Combine and sanitize for filename
    client_full_name = f"{client_surname}_{client_given}"
    sanitized_filename = sanitize_filename(client_full_name)
    
    # Add a timestamp to ensure uniqueness if multiple conversions happen quickly
    # and to differentiate files easily.
    timestamp = int(os.path.getmtime(input_path) * 1000) # Use CSV's modification time or current time
    fdf_filename = f"{sanitized_filename}_{timestamp}.fdf"
    output_path = os.path.join(output_dir, fdf_filename)

    fdf_content = create_fdf_header()
    
    unnamed_field_count = 0

    for field_name, field_value in selected_client_data.items():
        if field_value:
            if field_name.strip() == '':
                unnamed_field_count += 1
                if unnamed_field_count == 1:
                    field_name = 'ClientNameJP'
                elif unnamed_field_count == 2:
                    field_name = 'InsuredNameJP'
                else:
                    field_name = f'UnnamedField{unnamed_field_count}'

            fdf_content += f"<< /T ({escape_fdf_string(field_name)}) /V ({escape_fdf_string(field_value)}) >>\n"
    
    fdf_content += create_fdf_footer()

    try:
        with open(output_path, 'w', encoding='utf-8', errors='ignore') as fdf_file:
            fdf_file.write(fdf_content)
        
        # Print the generated filename to stdout for server2.js to capture
        print(json.dumps({"fdf_filename": fdf_filename}))
        
    except Exception as e:
        sys.stderr.write(f"Error writing FDF file: {e}\n")
        sys.exit(1)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.stderr.write("Usage:\n")
        sys.stderr.write("  python fdf_converter.py <input_csv_path> list_clients\n")
        sys.stderr.write("  python fdf_converter.py <input_csv_path> <output_dir> convert_client <client_index>\n")
        sys.exit(1)

    command = sys.argv[2]

    if command == 'list_clients':
        input_csv_path = sys.argv[1]
        list_clients(input_csv_path)
    elif command == 'convert_client':
        if len(sys.argv) != 5:
            sys.stderr.write("Usage: python fdf_converter.py <input_csv_path> <output_dir> convert_client <client_index>\n")
            sys.stderr.write(f"Received arguments: {sys.argv}\n")
            sys.exit(1)
        input_csv_path = sys.argv[1]
        output_dir = sys.argv[3] # Now this is the directory
        client_index = sys.argv[4]
        convert_selected_client_to_fdf(input_csv_path, output_dir, client_index)
    else:
        sys.stderr.write(f"Unknown command: {command}\n")
        sys.stderr.write("Usage:\n")
        sys.stderr.write("  python fdf_converter.py <input_csv_path> list_clients\n")
        sys.stderr.write("  python fdf_converter.py <input_csv_path> <output_dir> convert_client <client_index>\n")
        sys.exit(1)