import sys
import csv
import os
import json
import re
import zipfile
import time


def create_fdf_header():
    return "%FDF-1.2\n1 0 obj\n<<\n/FDF\n<<\n/Fields [\n"

def create_fdf_footer():
    return "]\n>>\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF"


def escape_fdf_string(s):
    s = str(s)
    s = s.replace('\n', '\\r').replace('\r', '\\r')
    s = s.replace(')', '\\)').replace('(', '\\(')
    s = s.replace('\\', '\\\\')
    return s

def sanitize_filename(name):
    """Sanitizes a string to be used as a filename."""
    s = name.replace(' ', '_')
    s = re.sub(r'[^\w.-]', '', s)
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
        sys.exit(1)

def list_clients(input_path):
    """
    Reads the CSV, extracts client display information, and prints it as JSON.
    It now checks for multiple possible field names for client and product.
    """
    all_clients_data = read_csv_data(input_path)

    clients_for_display = []
    for i, client_row in enumerate(reversed(all_clients_data)):
        original_index = len(all_clients_data) - 1 - i # Calculate original index
        
        # --- UPDATED LOGIC ---
        # Use fallback fields for surname, given name, and product.
        client_surname = client_row.get('Client1Sur') or client_row.get('settlorname[last]') or 'N/A'
        client_given = client_row.get('Client1Given') or client_row.get('settlorname[first]') or 'N/A'
        product_name = client_row.get('Product') or client_row.get('product') or 'N/A'
        # --- END UPDATED LOGIC ---
        
        clients_for_display.append({
            'original_index': original_index,
            'display_name': f"{client_surname} {client_given} (Product: {product_name})" 
        })
    
    print(json.dumps(clients_for_display))


def convert_selected_client_to_fdf(input_path, output_dir, client_index):
    """
    Converts a specific client's data from CSV to an FDF file.
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

    # --- UPDATED LOGIC for filename ---
    client_surname = selected_client_data.get('Client1Sur') or selected_client_data.get('settlorname[last]') or 'Unnamed'
    client_given = selected_client_data.get('Client1Given') or selected_client_data.get('settlorname[first]') or 'Client'
    # --- END UPDATED LOGIC ---
    
    client_full_name = f"{client_surname}_{client_given}"
    sanitized_filename = sanitize_filename(client_full_name)
    
    timestamp = int(time.time() * 1000) # Using current time for uniqueness
    fdf_filename = f"{sanitized_filename}_{timestamp}.fdf"
    output_path = os.path.join(output_dir, fdf_filename)

    fdf_content = create_fdf_header()
    
    unnamed_field_count = 0

    for field_name, field_value in selected_client_data.items():
        if field_value:
            if field_name is None or field_name.strip() == '':
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
        
        print(json.dumps({"fdf_filename": fdf_filename}))
        
    except Exception as e:
        sys.stderr.write(f"Error writing FDF file: {e}\n")
        sys.exit(1)

def convert_all_to_zip(input_csv_path, output_fdf_dir_for_zip, output_zip_path):
    """
    Reads all clients from a CSV, converts each to an FDF, and zips them.
    """
    all_clients_data = read_csv_data(input_csv_path)
    
    if not all_clients_data:
        sys.stderr.write("No client data found in the CSV file for bulk conversion.\n")
        sys.exit(1)

    if not os.path.exists(output_fdf_dir_for_zip):
        os.makedirs(output_fdf_dir_for_zip)

    fdf_files_to_zip = []

    try:
        for i, client_data in enumerate(all_clients_data):
            # --- UPDATED LOGIC for filename ---
            client_surname = client_data.get('Client1Sur') or client_data.get('settlorname[last]') or 'Unnamed'
            client_given = client_data.get('Client1Given') or client_data.get('settlorname[first]') or 'Client'
            # --- END UPDATED LOGIC ---

            client_full_name = f"{client_surname}_{client_given}"
            sanitized_filename = sanitize_filename(client_full_name)
            fdf_filename = f"{sanitized_filename}_{i + 1}.fdf"
            individual_fdf_path = os.path.join(output_fdf_dir_for_zip, fdf_filename)

            fdf_content = create_fdf_header()
            unnamed_field_count = 0
            for field_name, field_value in client_data.items():
                if field_value:
                    if field_name is None or field_name.strip() == '':
                        unnamed_field_count += 1
                        if unnamed_field_count == 1:
                            field_name = 'ClientNameJP'
                        elif unnamed_field_count == 2:
                            field_name = 'InsuredNameJP'
                        else:
                            field_name = f'UnnamedField{unnamed_field_count}'
                    fdf_content += f"<< /T ({escape_fdf_string(field_name)}) /V ({escape_fdf_string(field_value)}) >>\n"
            fdf_content += create_fdf_footer()

            with open(individual_fdf_path, 'w', encoding='utf-8', errors='ignore') as fdf_file:
                fdf_file.write(fdf_content)
            
            fdf_files_to_zip.append(individual_fdf_path)

        with zipfile.ZipFile(output_zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for fdf_file_path in fdf_files_to_zip:
                zipf.write(fdf_file_path, os.path.basename(fdf_file_path))
        
    except Exception as e:
        sys.stderr.write(f"Error during bulk FDF conversion or zipping: {e}\n")
        sys.exit(1)
    finally:
        for fdf_file_path in fdf_files_to_zip:
            if os.path.exists(fdf_file_path):
                os.remove(fdf_file_path)

def generate_empty_fdf(input_path, output_dir):
    """
    Creates an FDF file with all field names from the CSV header but with empty values.
    """
    try:
        with open(input_path, 'r', encoding='utf-8', errors='ignore') as csv_file:
            csv_reader = csv.reader(csv_file)
            headers = next(csv_reader) # Read only the header row
    except Exception as e:
        sys.stderr.write(f"Error reading CSV header: {e}\n")
        sys.exit(1)

    fdf_filename = f"empty_fdf_template_{int(time.time() * 1000)}.fdf"
    output_path = os.path.join(output_dir, fdf_filename)

    fdf_content = create_fdf_header()
    
    unnamed_field_count = 0
    for field_name in headers:
        if field_name is None or field_name.strip() == '':
            unnamed_field_count += 1
            if unnamed_field_count == 1:
                field_name = 'ClientNameJP'
            elif unnamed_field_count == 2:
                field_name = 'InsuredNameJP'
            else:
                field_name = f'UnnamedField{unnamed_field_count}'
        
        fdf_content += f"<< /T ({escape_fdf_string(field_name)}) /V () >>\n"

    fdf_content += create_fdf_footer()

    try:
        with open(output_path, 'w', encoding='utf-8', errors='ignore') as fdf_file:
            fdf_file.write(fdf_content)
        
        print(json.dumps({"fdf_filename": fdf_filename}))
        
    except Exception as e:
        sys.stderr.write(f"Error writing empty FDF file: {e}\n")
        sys.exit(1)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.stderr.write("Usage:\n")
        sys.stderr.write("  python fdf_converter.py <input_csv_path> list_clients\n")
        sys.stderr.write("  python fdf_converter.py <input_csv_path> convert_client <output_dir> <client_index>\n")
        sys.stderr.write("  python fdf_converter.py <input_csv_path> convert_all_to_zip <output_dir> <output_zip_path>\n")
        sys.stderr.write("  python fdf_converter.py <input_csv_path> generate_empty_fdf <output_dir>\n")
        sys.exit(1)

    command = sys.argv[2]
    input_csv_path = sys.argv[1]

    if command == 'list_clients':
        if len(sys.argv) != 3:
            sys.stderr.write("Usage: python fdf_converter.py <input_csv_path> list_clients\n")
            sys.exit(1)
        list_clients(input_csv_path)
    
    elif command == 'convert_client':
        if len(sys.argv) != 5:
            sys.stderr.write("Usage: python fdf_converter.py <input_csv_path> convert_client <output_dir> <client_index>\n")
            sys.exit(1)
        output_dir = sys.argv[3]
        client_index = sys.argv[4]
        convert_selected_client_to_fdf(input_csv_path, output_dir, client_index)

    elif command == 'convert_all_to_zip':
        if len(sys.argv) != 5:
            sys.stderr.write("Usage: python fdf_converter.py <input_csv_path> convert_all_to_zip <output_dir> <output_zip_path>\n")
            sys.exit(1)
        output_fdf_dir_for_zip = sys.argv[3]
        output_zip_path = sys.argv[4]
        convert_all_to_zip(input_csv_path, output_fdf_dir_for_zip, output_zip_path)
    
    elif command == 'generate_empty_fdf':
        if len(sys.argv) != 4:
            sys.stderr.write("Usage: python fdf_converter.py <input_csv_path> generate_empty_fdf <output_dir>\n")
            sys.exit(1)
        output_dir = sys.argv[3]
        generate_empty_fdf(input_csv_path, output_dir)

    else:
        sys.stderr.write(f"Unknown command: {command}\n")
        sys.stderr.write("Usage:\n")
        sys.stderr.write("  python fdf_converter.py <input_csv_path> list_clients\n")
        sys.stderr.write("  python fdf_converter.py <input_csv_path> convert_client <output_dir> <client_index>\n")
        sys.stderr.write("  python fdf_converter.py <input_csv_path> convert_all_to_zip <output_dir> <output_zip_path>\n")
        sys.stderr.write("  python fdf_converter.py <input_csv_path> generate_empty_fdf <output_dir>\n")
        sys.exit(1)