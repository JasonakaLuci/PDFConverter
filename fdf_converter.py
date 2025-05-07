import sys
import csv
import os

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

def csv_to_fdf(input_path, output_path):
    try:
        print(f"Input CSV path: {input_path}")
        print(f"Output FDF path: {output_path}")

        # Read CSV file
        with open(input_path, 'r', encoding='utf-8', errors='ignore') as csv_file:
            csv_reader = csv.DictReader(csv_file)
            
            # Create FDF content
            fdf_content = create_fdf_header()
            
            # Process each row in the CSV
            for row in csv_reader:
                for field_name, field_value in row.items():
                    if field_value:  # Only include non-empty fields
                        fdf_content += f"<< /T ({escape_fdf_string(field_name)}) /V ({escape_fdf_string(field_value)}) >>\n"
            
            fdf_content += create_fdf_footer()

            # Write FDF file
            with open(output_path, 'w', encoding='utf-8', errors='ignore') as fdf_file:
                fdf_file.write(fdf_content)

        print("CSV successfully converted to FDF!")
        
    except Exception as e:
        print(f"Error during conversion: {e}")

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: python fdf_converter.py <input_csv_path> <output_fdf_path>")
    else:
        try:
            input_csv_path = sys.argv[1].encode('utf-8').decode('utf-8')
            output_fdf_path = sys.argv[2].encode('utf-8').decode('utf-8')
            csv_to_fdf(input_csv_path, output_fdf_path)
        except Exception as e:
            print(f"Error: {e}")